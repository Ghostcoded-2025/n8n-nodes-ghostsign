import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { ApplicationError } from 'n8n-workflow';

function str(this: IExecuteFunctions, idx: number, name: string, def = ''): string {
	const v = this.getNodeParameter(name, idx, def) as string;

	return typeof v === 'string' ? v.trim() : '';
}

export function ghostsignResolveActionsEndpoint(operation: string): string {
	switch (operation) {
		case 'signingSend':
			return 'ghostsign-send-for-signature';
		case 'signingResend':
			return 'ghostsign-resend-finalize-email';
		case 'aiFill':
			return 'ghostsign-ai-fill';
		case 'renderPreview':
			return 'ghostsign-render-preview';
		case 'extractEmbed':
			return 'ghostsign-extract-embed';
		case 'upsertSmtp':
			return 'ghostsign-upsert-smtp';
		case 'upsertWebhook':
			return 'ghostsign-upsert-webhook';
		default:
			throw new ApplicationError(`Unknown Ghostsign Actions operation: ${operation}`);
	}
}

export function ghostsignBuildNamedOpBody(
	this: IExecuteFunctions,
	itemIndex: number,
	endpointHint: string,
): IDataObject {
	switch (endpointHint) {
		case 'ghostsign-send-for-signature':
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

		case 'ghostsign-render-preview': {
			const body: IDataObject = { project_id: str.call(this, itemIndex, 'projectId') };
			const previewLabelVal = str.call(this, itemIndex, 'previewLabel');

			if (previewLabelVal) {
				body.label = previewLabelVal;
			}

			return body;
		}

		case 'ghostsign-extract-embed': {
			const body: IDataObject = { project_id: str.call(this, itemIndex, 'projectId') };
			const mode = this.getNodeParameter('embedSourceMode', itemIndex, 'manualText') as string;
			const noteLabel = str.call(this, itemIndex, 'embedNoteLabel');

			if (mode === 'manualText') {
				const txt = str.call(this, itemIndex, 'embedManualText');
				if (!txt) {
					throw new ApplicationError('Manual text ingest requires embed text body content');
				}

				body.text = txt;
			} else {
				const storage = str.call(this, itemIndex, 'embedStoragePath');
				if (!storage) {
					throw new ApplicationError('Storage path ingest requires a storage bucket path');
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
			throw new ApplicationError(`Unhandled endpoint body builder: ${endpointHint}`);
	}
}
