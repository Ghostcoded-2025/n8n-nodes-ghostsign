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

const OPS_PROJECT_CORE = [
	'signingSend',
	'signingReminder',
	'signingResend',
	'aiFill',
	'projectChat',
	'projectResearch',
	'renderPreview',
	'extractEmbed',
	'proposalReviewSend',
];

const OPS_ORGS = [
	'upsertWebhook',
	'upsertSmtp',
	'smtpTest',
	'ingestTemplate',
	'cloneLibraryTemplate',
	'aiTemplateDraft',
	'publishTemplateDraft',
];

export class GhostsignActions implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Ghostsign Actions',
		name: 'ghostsignActions',
		icon: { light: 'file:ghostsignActions.svg', dark: 'file:ghostsignActions.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description:
			'Ghostsign automation helpers covering signing delivery, previews, embeddings, SMTP, AI fill, chat with project, and webhooks.',
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
						action: 'Ask model about a project using embeddings and notes RAG',
						name: 'AI › Chat With Project',
						value: 'projectChat',
						description:
							'Requires scoped key `ghostsign:ai:chat`, Growth+ tier, embedded context, and BYOK credentials like AI Fill',
					},
					{
						action: 'Invoke ghostsign ai fill for embeddings aware variable generation',
						name: 'AI › Fill Variable',
						value: 'aiFill',
						description: 'Requires `ghostsign:ai:write` plus BYOK credentials on the key owner',
					},
					{
						action: 'Ask model about a project using embeddings and web research',
						name: 'AI › Research With Project',
						value: 'projectResearch',
						description:
							'Requires scoped key `ghostsign:ai:chat`, Growth+ tier, embedded context, BYOK, and platform web search env on Edge',
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
						action: 'Email proposal review links to recipients',
						name: 'Preview › Send Review Links',
						value: 'proposalReviewSend',
						description: 'Requires saved SMTP + preview scope (`ghostsign:preview:write`)',
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
						description:
							'Renders a fresh Drive preview, then emails signers (`ghostsign:signing:send`). Skips signers who already submitted on re-send.',
					},
					{
						action: 'Email signing reminders to signers who have not submitted',
						name: 'Signing › Send Reminder',
						value: 'signingReminder',
						description:
							'Project must be `out_for_signature`. Reuses the existing envelope PDF; only pending signers (`ghostsign:signing:send`, `reminder_only`).',
					},
					{
						action: 'Generate iterative ai template body with placeholder aware prompts',
						name: 'Templates › AI Draft Body',
						value: 'aiTemplateDraft',
						description: 'Uses `ghostsign-ai-template-draft` (`ghostsign:ai:write`)',
					},
					{
						action: 'Clone platform template into workspace google drive and ingest',
						name: 'Templates › Clone Library Template',
						value: 'cloneLibraryTemplate',
						description: 'Requires template write scope (`ghostsign:template:write`)',
					},
					{
						action: 'Import or refresh template from google doc',
						name: 'Templates › Ingest From Google Doc',
						value: 'ingestTemplate',
						description: 'Create or refresh workspace template via `ghostsign-ingest-template`',
					},
					{
						action: 'Create a google doc from ai template draft content',
						name: 'Templates › Publish Draft To Doc',
						value: 'publishTemplateDraft',
						description: 'Publishes draft content using `ghostsign-publish-template-draft`',
					},
					{
						action: 'Duplicate one workspace into a new workspace',
						name: 'Workspace › Clone Workspace',
						value: 'cloneWorkspace',
						description: 'Copies templates/projects from source org (`ghostsign:org:write`)',
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
				displayName: 'Signing Link Expires In (Days)',
				name: 'signingLinkExpiresDays',
				type: 'number',
				default: 7,
				displayOptions: { show: { operation: ['signingSend', 'signingReminder'] } },
				description: 'Optional. Default **7**. Applied to newly issued signing tokens (1–180).',
			},
			{
				displayName: 'Invite Note (Optional)',
				name: 'signingInviteNote',
				type: 'string',
				typeOptions: { rows: 4 },
				displayOptions: { show: { operation: ['signingSend', 'signingReminder'] } },
				default: '',
				description: 'Personal note inlined in the signing email (max 2000 characters)',
			},
			{
				displayName: 'Chat Message',
				name: 'projectChatMessage',
				type: 'string',
				default: '',
				displayOptions: { show: { operation: ['projectChat', 'projectResearch'] } },
				description: 'Question answered with snippets from notes and embeddings (chat) or plus web results (research)',
				typeOptions: {
					rows: 4,
				},
			},
			{
				displayName: 'Session ID (Optional)',
				name: 'projectChatSessionId',
				type: 'string',
				default: '',
				displayOptions: { show: { operation: ['projectChat', 'projectResearch'] } },
				description: 'From the prior **`session_id`** in the JSON response to continue the same thread',
			},
			{
				displayName: 'AI Draft Mode',
				name: 'aiDraftMode',
				type: 'options',
				default: 'organization',
				displayOptions: { show: { operation: ['aiTemplateDraft'] } },
				options: [
					{ name: 'Admin Library', value: 'admin_library' },
					{ name: 'Organization', value: 'organization' },
				],
			},
			{
				displayName: 'AI Draft Document Body',
				name: 'aiDraftDocumentBody',
				type: 'string',
				typeOptions: { rows: 8 },
				default: '',
				displayOptions: { show: { operation: ['aiTemplateDraft'] } },
			},
			{
				displayName: 'AI Draft Messages JSON',
				name: 'aiDraftMessagesJson',
				type: 'string',
				typeOptions: { rows: 8 },
				default: '',
				displayOptions: { show: { operation: ['aiTemplateDraft'] } },
				description: 'JSON array like `[{"role":"user","content":"Refine intro"}]`',
			},
			{
				displayName: 'Variable Name',
				name: 'variableNameAi',
				type: 'string',
				default: '',
				displayOptions: { show: { operation: ['aiFill'] } },
				description: 'Single template placeholder to fill via ghostsign-ai-fill (repeat the node or loop items for multiple vars)',
				placeholder: 'e.g. client_company_name',
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
				displayName: 'Recipients JSON',
				name: 'reviewRecipientsJson',
				type: 'string',
				typeOptions: {
					rows: 6,
				},
				displayOptions: { show: { operation: ['proposalReviewSend'] } },
				default: '',
				description: 'JSON array like `[{"email":"client@example.com","name":"Client Name"}]`',
			},
			{
				displayName: 'Review Label (Optional)',
				name: 'reviewLabel',
				type: 'string',
				displayOptions: { show: { operation: ['proposalReviewSend'] } },
				default: '',
			},
			{
				displayName: 'Email Message (Optional)',
				name: 'reviewMessage',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				displayOptions: { show: { operation: ['proposalReviewSend'] } },
				default: '',
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
				displayName: 'Library Template ID',
				name: 'libraryTemplateId',
				type: 'string',
				displayOptions: { show: { operation: ['cloneLibraryTemplate'] } },
				default: '',
			},
			{
				displayName: 'Template Display Name (Optional)',
				name: 'cloneLibraryDisplayName',
				type: 'string',
				displayOptions: { show: { operation: ['cloneLibraryTemplate'] } },
				default: '',
			},
			{
				displayName: 'Ingest Mode',
				name: 'ingestMode',
				type: 'options',
				default: 'create',
				displayOptions: { show: { operation: ['ingestTemplate'] } },
				options: [
					{ name: 'Create Template From Doc', value: 'create' },
					{ name: 'Refresh Existing Template', value: 'refresh' },
				],
			},
			{
				displayName: 'Template ID (Refresh)',
				name: 'ingestTemplateId',
				type: 'string',
				displayOptions: { show: { operation: ['ingestTemplate'], ingestMode: ['refresh'] } },
				default: '',
			},
			{
				displayName: 'Google Doc URL',
				name: 'ingestDocUrl',
				type: 'string',
				displayOptions: { show: { operation: ['ingestTemplate'], ingestMode: ['create'] } },
				default: '',
			},
			{
				displayName: 'Google Document ID',
				name: 'ingestDocumentId',
				type: 'string',
				displayOptions: { show: { operation: ['ingestTemplate'], ingestMode: ['create'] } },
				default: '',
			},
			{
				displayName: 'Template Display Name (Optional)',
				name: 'ingestDisplayName',
				type: 'string',
				displayOptions: { show: { operation: ['ingestTemplate'], ingestMode: ['create'] } },
				default: '',
			},
			{
				displayName: 'Publish Mode',
				name: 'publishDraftMode',
				type: 'options',
				default: 'organization',
				displayOptions: { show: { operation: ['publishTemplateDraft'] } },
				options: [
					{ name: 'Admin Library', value: 'admin_library' },
					{ name: 'Organization', value: 'organization' },
				],
			},
			{
				displayName: 'Publish Document Body',
				name: 'publishDraftDocumentBody',
				type: 'string',
				typeOptions: { rows: 8 },
				displayOptions: { show: { operation: ['publishTemplateDraft'] } },
				default: '',
			},
			{
				displayName: 'Template Display Name (Optional)',
				name: 'publishDraftDisplayName',
				type: 'string',
				displayOptions: { show: { operation: ['publishTemplateDraft'] } },
				default: '',
			},
			{
				displayName: 'Source Organization Name or ID',
				name: 'sourceOrganizationId',
				type: 'options',
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				typeOptions: { loadOptionsMethod: 'getOrganizations' },
				displayOptions: { show: { operation: ['cloneWorkspace'] } },
				default: '',
			},
			{
				displayName: 'New Workspace Name (Optional)',
				name: 'cloneWorkspaceName',
				type: 'string',
				displayOptions: { show: { operation: ['cloneWorkspace'] } },
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
				displayName: 'SMTP Test Recipient',
				name: 'smtpTestTo',
				type: 'string',
				displayOptions: { show: { operation: ['smtpTest'] } },
				default: '',
				description: 'Email address that should receive the SMTP test message',
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
