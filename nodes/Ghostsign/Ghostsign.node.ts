import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { normalizeExecutionError } from '../shared/normalizeExecutionError';

import {
	coerceGhostsignCredentials,
	ghostsignEdgePostJson,
	type MinimalHttpHelpers,
} from '../shared/GhostsignRequest';
import { ghostsignBuildDataApiBody } from './dataApiBodies';

const TEMPLATE_OPS = ['templates.get', 'templates.update', 'templates.archive', 'templates.unarchive', 'templates.delete'];

const SIGNATURE_ASSIGNMENT_OPS_NEED_PROJECT_ID = [
	'signature_assignments.list',
	'signature_assignments.create',
];

const PROJECT_OPS_REQUIRING_ID = [
	'projects.get',
	'projects.update',
	'projects.delete',
	'projects.archive',
	'projects.unarchive',
	'previews.list',
];

const ORG_SELECTOR_OPS = ['templates.list', 'projects.list', 'projects.create', 'projects.clone'];

export class Ghostsign implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Ghostsign',
		name: 'ghostsign',
		icon: { light: 'file:ghostsign.svg', dark: 'file:ghostsign.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Call Ghostsign unified `ghostsign-api` (orgs, templates, projects, previews, signer rows)',
		defaults: { name: 'Ghostsign' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'ghostsignApi',
				required: true,
			},
		],
		usableAsTool: true,
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Organizations › List Workspaces', value: 'organizations.list' },
					{ name: 'Previews › List', value: 'previews.list' },
					{ name: 'Projects › Archive', value: 'projects.archive' },
					{ name: 'Projects › Clone', value: 'projects.clone' },
					{ name: 'Projects › Create', value: 'projects.create' },
					{ name: 'Projects › Delete', value: 'projects.delete' },
					{ name: 'Projects › Get', value: 'projects.get' },
					{ name: 'Projects › List', value: 'projects.list' },
					{ name: 'Projects › Unarchive', value: 'projects.unarchive' },
					{ name: 'Projects › Update', value: 'projects.update' },
					{ name: 'Signature Assignments › Create', value: 'signature_assignments.create' },
					{ name: 'Signature Assignments › Delete', value: 'signature_assignments.delete' },
					{ name: 'Signature Assignments › List', value: 'signature_assignments.list' },
					{ name: 'Signature Assignments › Update Row', value: 'signature_assignments.update' },
					{ name: 'Templates › Archive', value: 'templates.archive' },
					{ name: 'Templates › Delete', value: 'templates.delete' },
					{ name: 'Templates › Get', value: 'templates.get' },
					{ name: 'Templates › List', value: 'templates.list' },
					{ name: 'Templates › Unarchive', value: 'templates.unarchive' },
					{ name: 'Templates › Update Metadata', value: 'templates.update' },
				],
				default: 'organizations.list',
			},
			{
				displayName: 'Organization Name or ID',
				name: 'organizationId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getOrganizations' },
				default: '',
				displayOptions: { show: { operation: [...ORG_SELECTOR_OPS] } },
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Include Archived Organizations',
				name: 'includeArchived',
				type: 'boolean',
				displayOptions: { show: { operation: ['organizations.list'] } },
				default: false,
			},
			{
				displayName: 'Include Archived Templates',
				name: 'includeArchivedTemplates',
				type: 'boolean',
				displayOptions: { show: { operation: ['templates.list'] } },
				default: false,
			},
			{
				displayName: 'Include Archived Projects',
				name: 'includeArchivedProjects',
				type: 'boolean',
				displayOptions: { show: { operation: ['projects.list'] } },
				default: false,
			},
			{
				displayName: 'Template',
				name: 'templateId',
				type: 'string',
				default: '',
				displayOptions: { show: { operation: [...TEMPLATE_OPS] } },
				description:
					'Template UUID from `templates.list`, used for lifecycle operations against the same workspace',
			},
			{
				displayName: 'Template ID (Proposal Creation)',
				name: 'templateIdProject',
				type: 'string',
				default: '',
				displayOptions: { show: { operation: ['projects.create'] } },
				description: 'Workspace template UUID selected for the new proposal',
			},
			{
				displayName: 'Project',
				name: 'projectId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: [...PROJECT_OPS_REQUIRING_ID, ...SIGNATURE_ASSIGNMENT_OPS_NEED_PROJECT_ID],
					},
				},
				description: 'Proposal UUID (`projects.list`). Also used when managing previews and signer configuration rows.',
			},
			{
				displayName: 'Source Project ID (Clone)',
				name: 'sourceProjectId',
				type: 'string',
				displayOptions: { show: { operation: ['projects.clone'] } },
				default: '',
			},
			{
				displayName: 'New Display Name (Optional)',
				name: 'displayNameNewProject',
				type: 'string',
				displayOptions: { show: { operation: ['projects.create'] } },
				default: '',
			},
			{
				displayName: 'Cloned Proposal Name (Optional)',
				name: 'displayNameCloneProject',
				type: 'string',
				displayOptions: { show: { operation: ['projects.clone'] } },
				default: '',
			},
			{
				displayName: 'Skip Variable Values Patch',
				name: 'suppressVariableValuesPatch',
				type: 'boolean',
				displayOptions: { show: { operation: ['projects.update'] } },
				default: false,
				description:
					'Whether to omit sending `variable_values` so CC recipients, renaming, or notes can update without drafting placeholder JSON payloads',
			},
			{
				displayName: 'Variable Values (JSON)',
				name: 'variableValuesJson',
				type: 'string',
				typeOptions: {
					rows: 6,
				},
				displayOptions: { show: { operation: ['projects.update'], suppressVariableValuesPatch: [false] } },
				default: '',
				description: 'Object keyed by template variable identifiers. Leave blank if not updating values.',
			},
			{
				displayName: 'Set Notes',
				name: 'setContextNotes',
				type: 'boolean',
				displayOptions: { show: { operation: ['projects.update'] } },
				default: false,
			},
			{
				displayName: 'Context Notes',
				name: 'contextNotesBody',
				type: 'string',
				displayOptions: { show: { operation: ['projects.update'], setContextNotes: [true] } },
				default: '',
			},
			{
				displayName: 'Executed PDF CC (JSON)',
				name: 'executedPdfCcJson',
				type: 'string',
				typeOptions: { rows: 6 },
				displayOptions: { show: { operation: ['projects.update'] } },
				default: '',
				description: 'Mailbox list per Ghostsign docs (JSON array/objects). Completed proposals only restrictions apply.',
			},
			{
				displayName: 'Display Name (Patch)',
				name: 'projectDisplayName',
				type: 'string',
				displayOptions: { show: { operation: ['projects.update'] } },
				default: '',
				description: 'Renames proposals in draft or satisfies completed-proposal rename-only edits when used alone',
			},
			{
				displayName: 'Parsed Variables JSON',
				name: 'parsedVariablesJson',
				type: 'string',
				typeOptions: { rows: 6 },
				displayOptions: { show: { operation: ['templates.update'] } },
				default: '',
				description: 'Ghostsign canonical `parsed_variables` array structure from the ingestion pipeline',
			},
			{
				displayName: 'Template Display Name',
				name: 'templateDisplayName',
				type: 'string',
				displayOptions: { show: { operation: ['templates.update'] } },
				default: '',
				description:
					'Optional rename. Provide parsed JSON and/or rename text—Ghostsign rejects empty PATCH bodies.',
			},
			{
				displayName: 'Assignment UUID',
				name: 'assignmentId',
				type: 'string',
				displayOptions: { show: { operation: ['signature_assignments.delete', 'signature_assignments.update'] } },
				default: '',
				description: 'Identifier returned after `signature_assignments.create`; list rows via `.list`',
			},
			{
				displayName: 'Template Variable Key',
				name: 'assignmentVariableKey',
				type: 'string',
				displayOptions: { show: { operation: ['signature_assignments.create'] } },
				default: '',
				description: '{{placeholder_key}} referencing the signer field on the Ghostsign template',
			},
			{
				displayName: 'Signer Email',
				name: 'signerEmail',
				type: 'string',
				displayOptions: { show: { operation: ['signature_assignments.create'] } },
				default: '',
			},
			{
				displayName: 'Signer Name',
				name: 'signerName',
				type: 'string',
				displayOptions: { show: { operation: ['signature_assignments.create'] } },
				default: '',
				description:
					'Displayed label in signing emails (Ghostsign substitutes the signer email whenever this field is blank)',
			},
			{
				displayName: 'Field Type',
				name: 'assignmentFieldType',
				type: 'options',
				displayOptions: { show: { operation: ['signature_assignments.create'] } },
				default: 'signature',
				options: [
					{ name: 'Date', value: 'date' },
					{ name: 'Initial', value: 'initial' },
					{ name: 'Signature', value: 'signature' },
					{ name: 'Text', value: 'text' },
				],
			},
			{
				displayName: 'Required Field',
				name: 'assignmentRequired',
				type: 'boolean',
				displayOptions: { show: { operation: ['signature_assignments.create'] } },
				default: true,
			},
			{
				displayName: 'Sort Order',
				name: 'assignmentSortOrder',
				type: 'number',
				displayOptions: { show: { operation: ['signature_assignments.create'] } },
				default: 0,
			},
			{
				displayName: 'Overlay Rect (JSON)',
				name: 'overlayRectJson',
				type: 'string',
				typeOptions: { rows: 6 },
				displayOptions: { show: { operation: ['signature_assignments.create'] } },
				default: '',
				description: 'Optional signer overlay metadata persisted with the assignment row',
			},
			{
				displayName: 'Template Variable Key (Full Patch)',
				name: 'assignmentVariableKeyPatch',
				type: 'string',
				displayOptions: { show: { operation: ['signature_assignments.update'] } },
				default: '',
				description: 'Assignments expect the complete row snapshot—supply all fields Ghostsign mandates',
			},
			{
				displayName: 'Signer Email (Patch)',
				name: 'signerEmailPatch',
				type: 'string',
				displayOptions: { show: { operation: ['signature_assignments.update'] } },
				default: '',
			},
			{
				displayName: 'Signer Name (Patch)',
				name: 'signerNamePatch',
				type: 'string',
				displayOptions: { show: { operation: ['signature_assignments.update'] } },
				default: '',
			},
			{
				displayName: 'Field Type (Patch)',
				name: 'assignmentFieldTypePatch',
				type: 'options',
				displayOptions: { show: { operation: ['signature_assignments.update'] } },
				default: 'signature',
				options: [
					{ name: 'Date', value: 'date' },
					{ name: 'Initial', value: 'initial' },
					{ name: 'Signature', value: 'signature' },
					{ name: 'Text', value: 'text' },
				],
			},
			{
				displayName: 'Required (Patch)',
				name: 'assignmentRequiredPatch',
				type: 'boolean',
				displayOptions: { show: { operation: ['signature_assignments.update'] } },
				default: true,
			},
			{
				displayName: 'Sort Order (Patch)',
				name: 'assignmentSortOrderPatch',
				type: 'number',
				displayOptions: { show: { operation: ['signature_assignments.update'] } },
				default: 0,
			},
			{
				displayName: 'Clear Overlay Rect',
				name: 'clearOverlayRect',
				type: 'boolean',
				displayOptions: { show: { operation: ['signature_assignments.update'] } },
				default: false,
				description: 'Whether to clear `overlay_rect` on this assignment row',
			},
			{
				displayName: 'Overlay Rect JSON (Patch)',
				name: 'overlayRectJsonPatch',
				type: 'string',
				typeOptions: { rows: 6 },
				displayOptions: {
					show: { operation: ['signature_assignments.update'], clearOverlayRect: [false] },
				},
				default: '',
				description:
					'Optional overlay metadata JSON Ghostsign persists for PDF placement (omit when relying on auto layout)',
			},
		],
	};

	methods = {
		loadOptions: {
			async getOrganizations(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const raw = await this.getCredentials('ghostsignApi');
				const helpers: MinimalHttpHelpers = { httpRequest: this.helpers.httpRequest.bind(this.helpers) };
				const credentials = coerceGhostsignCredentials(raw);
				const resp = await ghostsignEdgePostJson(helpers, credentials, 'ghostsign-api', {
					op: 'organizations.list',
					include_archived: false,
				});
				const record = resp as Record<string, unknown>;
				const orgsUnknown = record.organizations;

				const orgs =
					Array.isArray(orgsUnknown) && orgsUnknown.length > 0
						? (orgsUnknown as Array<Record<string, unknown>>).filter(Boolean)
						: [];

				return orgs.map((entry) => {
					const label =
						typeof entry.name === 'string' && entry.name.trim() !== ''
							? `${entry.name} (${String(entry.id ?? '')})`
							: String(entry.id ?? 'unknown-org');
					return {
						name: label,
						value: String(entry.id ?? ''),
					};
				});
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const helpers: MinimalHttpHelpers = { httpRequest: this.helpers.httpRequest.bind(this.helpers) };

		const out: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const credentials = coerceGhostsignCredentials(await this.getCredentials('ghostsignApi', itemIndex));
				const operation = this.getNodeParameter('operation', itemIndex) as string;
				const payload = await ghostsignBuildDataApiBody.call(this, itemIndex, operation);
				const data = await ghostsignEdgePostJson(helpers, credentials, 'ghostsign-api', payload);
				out.push({
					json: data as IDataObject,
					pairedItem: { item: itemIndex },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					out.push({
						json:
							items[itemIndex]?.json !== undefined
								? (items[itemIndex].json as IDataObject)
								: {},
						error: normalizeExecutionError(this.getNode(), error, itemIndex),
						pairedItem: { item: itemIndex },
					});

					continue;
				}

				throw new NodeOperationError(this.getNode(), error as Error | string, {
					itemIndex,
				});
			}
		}

		return [out];
	}
}
