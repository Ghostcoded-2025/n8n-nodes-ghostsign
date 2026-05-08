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
import {
	ghostsignBuildNamedOpBody,
	ghostsignResolveActionsEndpoint,
} from './namedBodies';

const OPS_PROJECT_CORE = ['signingSend', 'signingResend', 'aiFill', 'renderPreview', 'extractEmbed'];

const OPS_ORGS = ['upsertWebhook', 'upsertSmtp'];

export class GhostsignActions implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Ghostsign Actions',
		name: 'ghostsignActions',
		icon: { light: 'file:ghostsignActions.svg', dark: 'file:ghostsignActions.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description:
			'Ghostsign automation helpers covering signing delivery, previews, embeddings, SMTP, AI fill, and webhooks.',
		defaults: { name: 'Ghostsign Actions' },
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
					{
						action: 'Invoke ghostsign ai fill for embeddings aware variable generation',
						name: 'AI › Fill Variable',
						value: 'aiFill',
						description: 'Requires `ghostsign:ai:write` plus BYOK credentials on the key owner',
					},
					{
						action: 'Invoke ghostsign extract embed for storage or manual text chunks',
						name: 'Embeddings › Ingest Chunk',
						value: 'extractEmbed',
						description: 'Adds Gemini vectors for RAG (`ghostsign:embed:write`)',
					},
					{
						action: 'Invoke ghostsign upsert smtp to save workspace relay settings',
						name: 'Integrations › Upsert SMTP',
						value: 'upsertSmtp',
						description: 'Owner/admin only workspace configuration (`ghostsign:integration:write`)',
					},
					{
						action: 'Invoke ghostsign upsert webhook to rotate signing webhook targets',
						name: 'Integrations › Upsert Webhook',
						value: 'upsertWebhook',
						description: 'Requires signing integration scope (`ghostsign:integration:write`)',
					},
					{
						action: 'Invoke ghostsign render preview to bake a docs preview revision',
						name: 'Preview › Render Doc',
						value: 'renderPreview',
						description: 'Needs Google connectivity on the authenticated actor (`ghostsign:preview:write`)',
					},
					{
						action: 'Invoke ghostsign resend finalize email for completed envelopes',
						name: 'Signing › Resend Completed PDF',
						value: 'signingResend',
						description: 'Only succeeds after the proposal status is completed (`ghostsign:signing:send`)',
					},
					{
						action: 'Invoke ghostsign send for signature email invites',
						name: 'Signing › Send Invite',
						value: 'signingSend',
						description: 'Workspace SMTP (`ghostsign:signing:send`) must succeed before emailing',
					},
				],
				default: 'aiFill',
			},
			{
				displayName: 'Project ID',
				name: 'projectId',
				type: 'string',
				default: '',
				displayOptions: { show: { operation: OPS_PROJECT_CORE } },
			},
			{
				displayName: 'Variable Name',
				name: 'variableNameAi',
				type: 'string',
				default: '',
				displayOptions: { show: { operation: ['aiFill'] } },
				description: 'Exact `{{placeholder}}` slug taken from Ghostsign ingestion metadata',
			},
			{
				displayName: 'Extra Prompt (Optional)',
				name: 'extraAiPrompt',
				type: 'string',
				default: '',
				displayOptions: { show: { operation: ['aiFill'] } },
			},
			{
				displayName: 'Preview Label',
				name: 'previewLabel',
				type: 'string',
				displayOptions: { show: { operation: ['renderPreview'] } },
				default: '',
				description: 'Optional descriptive label tagging the rendered Drive revision',
			},
			{
				displayName: 'Embedding Source Mode',
				name: 'embedSourceMode',
				type: 'options',
				default: 'manualText',
				displayOptions: { show: { operation: ['extractEmbed'] } },
				options: [
					{ name: 'Manual Text Chunk', value: 'manualText' },
					{ name: 'Storage Object', value: 'storagePath' },
				],
				description: 'Manual text pushes raw knowledge; storage mode downloads from `ghostsign-context` respecting org prefix rules',
			},
			{
				displayName: 'Manual Text Body',
				name: 'embedManualText',
				type: 'string',
				displayOptions: { show: { operation: ['extractEmbed'], embedSourceMode: ['manualText'] } },
				default: '',
				description:
					'Plain text pasted into Gemini chunking pipeline. Omit when reading from Storage instead.',
			},
			{
				displayName: 'Storage Path',
				name: 'embedStoragePath',
				type: 'string',
				default: '',
				displayOptions: {
					show: { operation: ['extractEmbed'], embedSourceMode: ['storagePath'] },
				},
				description: 'Fully qualified `{organization_id}/...` URI inside bucket `ghostsign-context`',
			},
			{
				displayName: 'Content Type Hint',
				name: 'embedContentType',
				type: 'string',
				placeholder: 'application/pdf',
				displayOptions: {
					show: { operation: ['extractEmbed'], embedSourceMode: ['storagePath'] },
				},
				default: '',
				description: 'Recommended when MIME cannot be inferred from file extension (.pdf/.md/.txt etc.)',
			},
			{
				displayName: 'Note Label',
				name: 'embedNoteLabel',
				type: 'string',
				displayOptions: {
					show: { operation: ['extractEmbed'], embedSourceMode: ['manualText'] },
				},
				default: '',
				description: 'Stores `note_label` metadata on textual batches returned as `embed_batch_id` payloads',
			},
			{
				displayName: 'Organization Name or ID',
				name: 'organizationIdUpsert',
				type: 'options',
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				displayOptions: { show: { operation: OPS_ORGS } },
				typeOptions: { loadOptionsMethod: 'getOrganizations' },
				default: '',
			},
			{
				displayName: 'SMTP Host',
				name: 'smtpHost',
				type: 'string',
				displayOptions: { show: { operation: ['upsertSmtp'] } },
				default: '',
			},
			{
				displayName: 'SMTP Port',
				name: 'smtpPort',
				type: 'number',
				displayOptions: { show: { operation: ['upsertSmtp'] } },
				default: 587,
				description: 'Common ports: 587 (STARTTLS), 465 (implicit TLS)',
			},
			{
				displayName: 'Encryption Mode',
				name: 'smtpEncryption',
				type: 'options',
				displayOptions: { show: { operation: ['upsertSmtp'] } },
				default: 'starttls',
				options: [
					{ name: 'None', value: 'none' },
					{ name: 'STARTTLS', value: 'starttls' },
					{ name: 'TLS', value: 'tls' },
				],
			},
			{
				displayName: 'SMTP Username',
				name: 'smtpUsername',
				type: 'string',
				displayOptions: { show: { operation: ['upsertSmtp'] } },
				default: '',
			},
			{
				displayName: 'SMTP Password',
				name: 'smtpPasswordPlain',
				typeOptions: {
					password: true,
				},
				displayOptions: { show: { operation: ['upsertSmtp'] } },
				type: 'string',
				default: '',
			},
			{
				displayName: 'From Address',
				name: 'smtpFrom',
				type: 'string',
				displayOptions: { show: { operation: ['upsertSmtp'] } },
				default: '',
			},
			{
				displayName: 'From Display Name (Optional)',
				name: 'smtpFromDisplay',
				type: 'string',
				displayOptions: { show: { operation: ['upsertSmtp'] } },
				default: '',
			},
			{
				displayName: 'Reply-To Address (Optional)',
				name: 'smtpReplyTo',
				type: 'string',
				displayOptions: { show: { operation: ['upsertSmtp'] } },
				default: '',
			},
			{
				displayName: 'Webhook URL',
				name: 'webhookUrl',
				type: 'string',
				displayOptions: { show: { operation: ['upsertWebhook'] } },
				default: '',
			},
			{
				displayName: 'Existing Webhook ID (Optional)',
				name: 'webhookExistingId',
				type: 'string',
				displayOptions: { show: { operation: ['upsertWebhook'] } },
				description: 'Paste an existing webhook UUID when rotating URL or disabling activity',
				default: '',
			},
			{
				displayName: 'Plaintext Secret Payload',
				name: 'webhookSecretPlain',
				typeOptions: { password: true },
				displayOptions: { show: { operation: ['upsertWebhook'] } },
				description: 'Mandatory on create; optional rotate path when patching an endpoint (leave blank to keep prior secret ciphertext)',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Webhook Active',
				name: 'webhookActive',
				type: 'boolean',
				displayOptions: { show: { operation: ['upsertWebhook'] } },
				default: true,
				description: 'Whether newly saved webhooks dispatch signing notifications immediately',
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

				const orgsPayload = resp as Record<string, unknown>;

				const list =
					Array.isArray(orgsPayload.organizations)
						? (orgsPayload.organizations as Record<string, unknown>[])
						: [];

				return list.map((row) => ({
					name: `${typeof row.name === 'string' && row.name ? row.name + ' • ' : ''}${String(row.id ?? '')}`,
					value: String(row.id ?? ''),
				}));
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
				const workflowOp = this.getNodeParameter('operation', itemIndex) as string;
				const endpointResolved = ghostsignResolveActionsEndpoint(workflowOp);

				const bodyBuilt = ghostsignBuildNamedOpBody.call(this, itemIndex, endpointResolved);

				const result = await ghostsignEdgePostJson(helpers, credentials, endpointResolved, bodyBuilt);
				out.push({
					json: result as IDataObject,
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

				throw new NodeOperationError(this.getNode(), error as Error | string, { itemIndex });
			}
		}

		return [out];
	}
}

export default GhostsignActions;
