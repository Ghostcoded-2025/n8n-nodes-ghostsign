import type { GenericValue, IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { ApplicationError } from 'n8n-workflow';
import type { GhostsignApiCredentialData } from '../../credentials/GhostsignApi.credentials';
import {
	coerceGhostsignCredentials,
	parseJsonObject,
	parseJsonValue,
} from '../shared/GhostsignRequest';

async function credential(this: IExecuteFunctions, idx: number): Promise<GhostsignApiCredentialData> {
	return coerceGhostsignCredentials(await this.getCredentials('ghostsignApi', idx));
}

function str(this: IExecuteFunctions, idx: number, param: string, def?: string): string {
	const raw = this.getNodeParameter(param, idx, def ?? '') as string;
	const s = typeof raw === 'string' ? raw.trim() : '';
	return s;
}

export async function ghostsignBuildDataApiBody(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject> {
	await credential.call(this, itemIndex);

	switch (operation) {
		case 'organizations.list':
			return {
				op: 'organizations.list',
				include_archived: this.getNodeParameter('includeArchived', itemIndex, false) as boolean,
			};

		case 'templates.list':
			return {
				op: 'templates.list',
				organization_id: str.call(this, itemIndex, 'organizationId'),
				include_archived: this.getNodeParameter('includeArchivedTemplates', itemIndex, false) as boolean,
			};

		case 'templates.get':
			return { op: 'templates.get', template_id: str.call(this, itemIndex, 'templateId') };

		case 'templates.update':
			return ghostsignTemplatesUpdate.apply(this, [itemIndex]);

		case 'templates.archive':
			return { op: 'templates.archive', template_id: str.call(this, itemIndex, 'templateId') };

		case 'templates.unarchive':
			return { op: 'templates.unarchive', template_id: str.call(this, itemIndex, 'templateId') };

		case 'templates.delete':
			return { op: 'templates.delete', template_id: str.call(this, itemIndex, 'templateId') };

		case 'projects.list':
			return {
				op: 'projects.list',
				organization_id: str.call(this, itemIndex, 'organizationId'),
				include_archived: this.getNodeParameter('includeArchivedProjects', itemIndex, false) as boolean,
			};

		case 'projects.get':
			return { op: 'projects.get', project_id: str.call(this, itemIndex, 'projectId') };

		case 'projects.create':
			return {
				op: 'projects.create',
				organization_id: str.call(this, itemIndex, 'organizationId'),
				template_id: str.call(this, itemIndex, 'templateIdProject'),
				display_name: str.call(this, itemIndex, 'displayNameNewProject', '') || undefined,
			};

		case 'projects.update':
			return ghostsignProjectsUpdate.apply(this, [itemIndex]);

		case 'projects.delete':
			return { op: 'projects.delete', project_id: str.call(this, itemIndex, 'projectId') };

		case 'projects.clone':
			return {
				op: 'projects.clone',
				organization_id: str.call(this, itemIndex, 'organizationId'),
				source_project_id: str.call(this, itemIndex, 'sourceProjectId'),
				display_name: str.call(this, itemIndex, 'displayNameCloneProject', '') || undefined,
			};

		case 'projects.archive':
			return { op: 'projects.archive', project_id: str.call(this, itemIndex, 'projectId') };

		case 'projects.unarchive':
			return { op: 'projects.unarchive', project_id: str.call(this, itemIndex, 'projectId') };

		case 'previews.list':
			return { op: 'previews.list', project_id: str.call(this, itemIndex, 'projectId') };

		case 'project.chat':
		case 'project.research': {
			const messageUnified = str.call(this, itemIndex, 'projectUnifiedAiMessage', '');
			if (!messageUnified) {
				throw new ApplicationError('project.chat and project.research require Message');
			}
			const bodyUnified: IDataObject = {
				op: operation,
				project_id: str.call(this, itemIndex, 'projectId'),
				message: messageUnified,
			};
			const sessionUnified = str.call(this, itemIndex, 'projectUnifiedSessionId', '');
			if (sessionUnified) {
				bodyUnified.session_id = sessionUnified;
			}
			return bodyUnified;
		}

		case 'signature_assignments.list':
			return { op: 'signature_assignments.list', project_id: str.call(this, itemIndex, 'projectId') };

		case 'signature_assignments.create':
			return ghostsignSignatureAssignmentCreate.apply(this, [itemIndex]);

		case 'signature_assignments.update':
			return ghostsignSignatureAssignmentUpdate.apply(this, [itemIndex]);

		case 'signature_assignments.delete':
			return {
				op: 'signature_assignments.delete',
				assignment_id: str.call(this, itemIndex, 'assignmentId'),
			};

		default:
			throw new ApplicationError(`Unhandled Ghostsign data API operation: ${operation}`);
	}
}

function ghostsignTemplatesUpdate(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const parsedVariablesRaw = this.getNodeParameter('parsedVariablesJson', itemIndex, '') as string;
	const displayNameRaw = str.call(this, itemIndex, 'templateDisplayName', '');

	const body: IDataObject = { op: 'templates.update', template_id: str.call(this, itemIndex, 'templateId') };

	if (displayNameRaw) {
		body.display_name = displayNameRaw;
	}

	const parsed = parseJsonObject(parsedVariablesRaw, 'Parsed variables JSON');
	if (parsed !== undefined) {
		body.parsed_variables = parsed;
	}

	if (!('display_name' in body) && !('parsed_variables' in body)) {
		throw new ApplicationError(
			'Provide display name and/or Parsed variables JSON for templates.update.',
		);
	}

	return body;
}

function ghostsignProjectsUpdate(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const variableValuesRaw = this.getNodeParameter('variableValuesJson', itemIndex, '') as string;
	const contextNotesProvided = Boolean(this.getNodeParameter('setContextNotes', itemIndex, false));
	const executedCcRaw = this.getNodeParameter('executedPdfCcJson', itemIndex, '') as string;
	const displayNameRaw = str.call(this, itemIndex, 'projectDisplayName', '');
	const suppressVariablePatch = Boolean(
		this.getNodeParameter('suppressVariableValuesPatch', itemIndex, false),
	);

	const body: IDataObject = { op: 'projects.update', project_id: str.call(this, itemIndex, 'projectId') };

	if (!suppressVariablePatch) {
		const vv = parseJsonObject(variableValuesRaw, 'Variable values JSON');
		if (vv !== undefined) {
			body.variable_values = vv;
		}
	}

	if (contextNotesProvided) {
		const notesRaw = str.call(this, itemIndex, 'contextNotesBody', '');
		body.context_notes = notesRaw === '' ? null : notesRaw;
	}

	const cc = parseJsonValue(executedCcRaw);
	if (cc !== undefined) {
		body.executed_pdf_cc = cc as GenericValue;
	}

	if (displayNameRaw) {
		body.display_name = displayNameRaw;
	}

	if (
		body.variable_values === undefined &&
		!('context_notes' in body) &&
		!('display_name' in body) &&
		body.executed_pdf_cc === undefined
	) {
		throw new ApplicationError(
			'Provide variable values JSON, notes, executed PDF CC, and/or display name.',
		);
	}

	return body;
}

function ghostsignSignatureAssignmentCreate(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const overlayRaw = str.call(this, itemIndex, 'overlayRectJson', '');

	const body: IDataObject = {
		op: 'signature_assignments.create',
		project_id: str.call(this, itemIndex, 'projectId'),
		template_variable_key: str.call(this, itemIndex, 'assignmentVariableKey'),
		signer_email: str.call(this, itemIndex, 'signerEmail'),
		signer_name: str.call(this, itemIndex, 'signerName'),
		field_type: this.getNodeParameter('assignmentFieldType', itemIndex, 'signature') as string,
		required: Boolean(this.getNodeParameter('assignmentRequired', itemIndex, true)),
		sort_order: Number(this.getNodeParameter('assignmentSortOrder', itemIndex, 0)),
	};

	const overlay = overlayRaw === '' ? undefined : parseJsonValue(overlayRaw);

	if (overlay !== undefined && overlay !== null) {
		body.overlay_rect = overlay as GenericValue;
	}

	return body;
}

function ghostsignSignatureAssignmentUpdate(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const overlayRaw = str.call(this, itemIndex, 'overlayRectJsonPatch', '');

	const body: IDataObject = {
		op: 'signature_assignments.update',
		assignment_id: str.call(this, itemIndex, 'assignmentId'),
		template_variable_key: str.call(this, itemIndex, 'assignmentVariableKeyPatch'),
		signer_email: str.call(this, itemIndex, 'signerEmailPatch'),
		signer_name: str.call(this, itemIndex, 'signerNamePatch'),
		field_type: this.getNodeParameter('assignmentFieldTypePatch', itemIndex, 'signature') as string,
		required: Boolean(this.getNodeParameter('assignmentRequiredPatch', itemIndex, true)),
		sort_order: Number(this.getNodeParameter('assignmentSortOrderPatch', itemIndex, 0)),
	};

	if (this.getNodeParameter('clearOverlayRect', itemIndex, false)) {
		body.overlay_rect = null;
	} else if (overlayRaw.trim() !== '') {
		body.overlay_rect = parseJsonValue(overlayRaw) as GenericValue;
	}

	return body;
}
