import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

function str(this: IExecuteFunctions, idx: number, name: string, def = ''): string {
	const v = this.getNodeParameter(name, idx, def) as string;

	return typeof v === 'string' ? v.trim() : '';
}

function buildSigningEnvelopeBody(
	this: IExecuteFunctions,
	itemIndex: number,
	reminderOnly: boolean,
): IDataObject {
	const projectId = str.call(this, itemIndex, 'projectId');
	if (!projectId) {
		throw new NodeOperationError(this.getNode(), 'Signing operations require Project ID.', {
			itemIndex,
		});
	}

	const body: IDataObject = { project_id: projectId };

	if (reminderOnly) {
		body.reminder_only = true;
	}

	const inviteNote = str.call(this, itemIndex, 'signingInviteNote');
	if (inviteNote) {
		body.invite_note = inviteNote.slice(0, 2000);
	}

	const daysRaw = this.getNodeParameter('signingLinkExpiresDays', itemIndex, 7);
	if (typeof daysRaw === 'number' && Number.isFinite(daysRaw)) {
		body.signing_link_expires_in_days = Math.min(180, Math.max(1, Math.floor(daysRaw)));
	}

	return body;
}

export function ghostsignResolveActionsEndpoint(operation: string): string {
	switch (operation) {
		case 'signingSend':
			return 'ghostsign-send-for-signature';
		case 'signingReminder':
			return 'ghostsign-send-for-signature-reminder';
		case 'signingResend':
			return 'ghostsign-resend-finalize-email';
		case 'aiFill':
			return 'ghostsign-ai-fill';
		case 'aiTemplateDraft':
			return 'ghostsign-ai-template-draft';
		case 'publishTemplateDraft':
			return 'ghostsign-publish-template-draft';
		case 'projectChat':
			return 'ghostsign-project-chat';
		case 'projectResearch':
			return 'ghostsign-project-research';
		case 'renderPreview':
			return 'ghostsign-render-preview';
		case 'proposalReviewSend':
			return 'ghostsign-proposal-review-send';
		case 'proposalReviewCancel':
			return 'ghostsign-proposal-review-cancel';
		case 'extractEmbed':
			return 'ghostsign-extract-embed';
		case 'smtpTest':
			return 'ghostsign-smtp-test';
		case 'ingestTemplate':
			return 'ghostsign-ingest-template';
		case 'cloneLibraryTemplate':
			return 'ghostsign-clone-library-template';
		case 'cloneWorkspace':
			return 'ghostsign-clone-workspace';
		case 'upsertSmtp':
			return 'ghostsign-upsert-smtp';
		case 'upsertWebhook':
			return 'ghostsign-upsert-webhook';
		default:
			throw new Error(`Unknown Ghostsign Actions operation: ${operation}`);
	}
}

function parseRecipientsJson(
	this: IExecuteFunctions,
	itemIndex: number,
	raw: string,
): Array<{ email: string; name?: string }> {
	let parsed: unknown;

	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new NodeOperationError(
			this.getNode(),
			`Recipients JSON must be valid JSON: ${(error as Error).message}`,
			{ itemIndex },
		);
	}

	if (!Array.isArray(parsed) || parsed.length === 0) {
		throw new NodeOperationError(this.getNode(), 'Recipients JSON must be a non-empty array.', {
			itemIndex,
		});
	}

	const recipients: Array<{ email: string; name?: string }> = [];

	for (const entry of parsed) {
		if (typeof entry !== 'object' || entry === null) {
			throw new NodeOperationError(
				this.getNode(),
				'Each recipient must be an object with at least an email field.',
				{ itemIndex },
			);
		}

		const row = entry as Record<string, unknown>;
		const email = typeof row.email === 'string' ? row.email.trim() : '';
		if (email === '') {
			throw new NodeOperationError(this.getNode(), 'Each recipient must include a non-empty email.', {
				itemIndex,
			});
		}

		const recipient: { email: string; name?: string } = { email };
		const name = typeof row.name === 'string' ? row.name.trim() : '';
		if (name !== '') {
			recipient.name = name;
		}
		recipients.push(recipient);
	}

	return recipients;
}

function parseAiDraftMessages(
	this: IExecuteFunctions,
	itemIndex: number,
	raw: string,
): Array<{ role: 'user' | 'assistant'; content: string }> {
	let parsed: unknown;

	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new NodeOperationError(
			this.getNode(),
			`AI Draft Messages JSON must be valid JSON: ${(error as Error).message}`,
			{ itemIndex },
		);
	}

	if (!Array.isArray(parsed) || parsed.length === 0) {
		throw new NodeOperationError(this.getNode(), 'AI Draft Messages JSON must be a non-empty array.', {
			itemIndex,
		});
	}

	const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

	for (const entry of parsed) {
		if (typeof entry !== 'object' || entry === null) {
			throw new NodeOperationError(this.getNode(), 'Each AI draft message must be an object.', {
				itemIndex,
			});
		}

		const row = entry as Record<string, unknown>;
		const role = row.role;
		const content = typeof row.content === 'string' ? row.content.trim() : '';
		if ((role !== 'user' && role !== 'assistant') || content === '') {
			throw new NodeOperationError(
				this.getNode(),
				'Each AI draft message requires `role` ("user" or "assistant") and non-empty `content`.',
				{ itemIndex },
			);
		}

		messages.push({ role, content });
	}

	return messages;
}

export function ghostsignBuildNamedOpBody(
	this: IExecuteFunctions,
	itemIndex: number,
	endpointHint: string,
): IDataObject {
	switch (endpointHint) {
		case 'ghostsign-send-for-signature':
		case 'ghostsign-send-for-signature-reminder':
			return buildSigningEnvelopeBody.call(this, itemIndex, endpointHint === 'ghostsign-send-for-signature-reminder');

		case 'ghostsign-resend-finalize-email':
			return { project_id: str.call(this, itemIndex, 'projectId') };

		case 'ghostsign-ai-fill': {
			const extra = str.call(this, itemIndex, 'extraAiPrompt');
			const body: IDataObject = {
				project_id: str.call(this, itemIndex, 'projectId'),
				variable_name: str.call(this, itemIndex, 'variableNameAi'),
			};

			if (extra) {
				body.extra_user_prompt = extra;
			}

			return body;
		}

		case 'ghostsign-ai-template-draft': {
			const body: IDataObject = {
				mode: str.call(this, itemIndex, 'aiDraftMode', 'organization'),
				document_body: str.call(this, itemIndex, 'aiDraftDocumentBody'),
				messages: parseAiDraftMessages.call(this, itemIndex, str.call(this, itemIndex, 'aiDraftMessagesJson')),
			};

			if (body.mode === 'organization') {
				body.organization_id = str.call(this, itemIndex, 'organizationIdUpsert');
			}

			return body;
		}

		case 'ghostsign-publish-template-draft': {
			const body: IDataObject = {
				mode: str.call(this, itemIndex, 'publishDraftMode', 'organization'),
				document_body: str.call(this, itemIndex, 'publishDraftDocumentBody'),
			};

			if (body.mode === 'organization') {
				body.organization_id = str.call(this, itemIndex, 'organizationIdUpsert');
			}

			const displayName = str.call(this, itemIndex, 'publishDraftDisplayName');
			if (displayName) {
				body.display_name = displayName;
			}

			return body;
		}

		case 'ghostsign-project-chat':
		case 'ghostsign-project-research': {
			const chatMessage = str.call(this, itemIndex, 'projectChatMessage');
			if (!chatMessage) {
				throw new NodeOperationError(this.getNode(), 'Chat With Project / Research requires Chat Message body text.', {
					itemIndex,
				});
			}

			const body: IDataObject = {
				project_id: str.call(this, itemIndex, 'projectId'),
				message: chatMessage,
			};

			const sessionIdRaw = str.call(this, itemIndex, 'projectChatSessionId', '');
			if (sessionIdRaw) {
				body.session_id = sessionIdRaw;
			}

			return body;
		}

		case 'ghostsign-render-preview': {
			const body: IDataObject = { project_id: str.call(this, itemIndex, 'projectId') };
			const previewLabelVal = str.call(this, itemIndex, 'previewLabel');

			if (previewLabelVal) {
				body.label = previewLabelVal;
			}

			return body;
		}

		case 'ghostsign-proposal-review-send': {
			const recipientsRaw = str.call(this, itemIndex, 'reviewRecipientsJson');
			if (!recipientsRaw) {
				throw new NodeOperationError(this.getNode(), 'Proposal review send requires Recipients JSON.', {
					itemIndex,
				});
			}

			const body: IDataObject = {
				project_id: str.call(this, itemIndex, 'projectId'),
				recipients: parseRecipientsJson.call(this, itemIndex, recipientsRaw),
			};

			const reviewLabel = str.call(this, itemIndex, 'reviewLabel');
			if (reviewLabel) {
				body.label = reviewLabel;
			}

			const reviewMessage = str.call(this, itemIndex, 'reviewMessage');
			if (reviewMessage) {
				body.message = reviewMessage;
			}

			const reviewExpiresDaysRaw = this.getNodeParameter('reviewOfferExpiresDays', itemIndex, 14);
			if (typeof reviewExpiresDaysRaw === 'number' && Number.isFinite(reviewExpiresDaysRaw)) {
				body.offer_expires_in_days = Math.min(365, Math.max(1, Math.floor(reviewExpiresDaysRaw)));
			}

			return body;
		}

		case 'ghostsign-proposal-review-cancel': {
			const proposalReviewId = str.call(this, itemIndex, 'proposalReviewId');
			if (!proposalReviewId) {
				throw new NodeOperationError(this.getNode(), 'Proposal review cancel requires Proposal Review ID.', {
					itemIndex,
				});
			}

			return { proposal_review_id: proposalReviewId };
		}

		case 'ghostsign-extract-embed': {
			const body: IDataObject = { project_id: str.call(this, itemIndex, 'projectId') };
			const mode = this.getNodeParameter('embedSourceMode', itemIndex, 'manualText') as string;
			const noteLabel = str.call(this, itemIndex, 'embedNoteLabel');

			if (mode === 'manualText') {
				const txt = str.call(this, itemIndex, 'embedManualText');
				if (!txt) {
					throw new NodeOperationError(this.getNode(), 'Manual text ingest requires embed text body content', {
						itemIndex,
					});
				}

				body.text = txt;
			} else {
				const storage = str.call(this, itemIndex, 'embedStoragePath');
				if (!storage) {
					throw new NodeOperationError(this.getNode(), 'Storage path ingest requires a storage bucket path', {
						itemIndex,
					});
				}

				body.storage_path = storage;
				const ctype = str.call(this, itemIndex, 'embedContentType', '');
				if (ctype) {
					body.content_type = ctype;
				}
			}

			if (noteLabel) {
				body.note_label = noteLabel;
			}

			Object.keys(body).forEach((k) => body[k as keyof IDataObject] === undefined && delete body[k]);

			return body;
		}

		case 'ghostsign-smtp-test':
			return {
				organization_id: str.call(this, itemIndex, 'organizationIdUpsert'),
				to: str.call(this, itemIndex, 'smtpTestTo'),
			};

		case 'ghostsign-ingest-template': {
			const body: IDataObject = {
				organization_id: str.call(this, itemIndex, 'organizationIdUpsert'),
			};
			const mode = str.call(this, itemIndex, 'ingestMode', 'create');
			if (mode === 'refresh') {
				body.template_id = str.call(this, itemIndex, 'ingestTemplateId');
				return body;
			}

			const docUrl = str.call(this, itemIndex, 'ingestDocUrl');
			const documentId = str.call(this, itemIndex, 'ingestDocumentId');
			if (!docUrl && !documentId) {
				throw new NodeOperationError(
					this.getNode(),
					'Ingest create mode requires Google Doc URL or Google Document ID.',
					{ itemIndex },
				);
			}
			if (docUrl) {
				body.doc_url = docUrl;
			}
			if (documentId) {
				body.document_id = documentId;
			}
			const ingestDisplayName = str.call(this, itemIndex, 'ingestDisplayName');
			if (ingestDisplayName) {
				body.display_name = ingestDisplayName;
			}
			return body;
		}

		case 'ghostsign-clone-library-template': {
			const body: IDataObject = {
				library_template_id: str.call(this, itemIndex, 'libraryTemplateId'),
				organization_id: str.call(this, itemIndex, 'organizationIdUpsert'),
			};
			const displayName = str.call(this, itemIndex, 'cloneLibraryDisplayName');
			if (displayName) {
				body.display_name = displayName;
			}
			return body;
		}

		case 'ghostsign-clone-workspace': {
			const body: IDataObject = {
				source_organization_id: str.call(this, itemIndex, 'sourceOrganizationId'),
			};
			const name = str.call(this, itemIndex, 'cloneWorkspaceName');
			if (name) {
				body.name = name;
			}
			return body;
		}

		case 'ghostsign-upsert-smtp': {
			const body: IDataObject = {
				organization_id: str.call(this, itemIndex, 'organizationIdUpsert'),
				host: str.call(this, itemIndex, 'smtpHost'),
				port: Number(this.getNodeParameter('smtpPort', itemIndex, 587)),
				encryption: str.call(this, itemIndex, 'smtpEncryption'),
				username: str.call(this, itemIndex, 'smtpUsername'),
				password_plain: str.call(this, itemIndex, 'smtpPasswordPlain'),
				from_address: str.call(this, itemIndex, 'smtpFrom'),
			};

			body.from_display_name = str.call(this, itemIndex, 'smtpFromDisplay', '') || null;
			body.reply_to = str.call(this, itemIndex, 'smtpReplyTo', '') || null;

			return body;
		}

		case 'ghostsign-upsert-webhook': {
			const body: IDataObject = {
				organization_id: str.call(this, itemIndex, 'organizationIdUpsert'),
				url: str.call(this, itemIndex, 'webhookUrl'),
				active: Boolean(this.getNodeParameter('webhookActive', itemIndex, true)),
			};

			const hookIdRaw = str.call(this, itemIndex, 'webhookExistingId');
			if (hookIdRaw.length > 0) {
				body.webhook_id = hookIdRaw;
			}

			const secretPlain = str.call(this, itemIndex, 'webhookSecretPlain');
			if (secretPlain !== '') {
				body.secret_plain = secretPlain;
			}

			return body;
		}

		default:
			throw new NodeOperationError(this.getNode(), `Unhandled endpoint body builder: ${endpointHint}`, {
				itemIndex,
			});
	}
}
