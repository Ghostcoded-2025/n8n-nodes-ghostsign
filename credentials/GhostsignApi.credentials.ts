import type { ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export type GhostsignApiCredentialData = {
	supabaseUrl: string;
	supabaseAnonKey: string;
	apiKeyBearer: string;
};

export class GhostsignApi implements ICredentialType {
	name = 'ghostsignApi';

	displayName = 'Ghostsign API';

	icon = { light: 'file:ghostsignApi.svg', dark: 'file:ghostsignApi.dark.svg' } as const;

	documentationUrl = 'https://github.com/ghostcoded/n8n-nodes-ghostsign#credential';

	properties: INodeProperties[] = [
		{
			displayName: 'Supabase URL',
			name: 'supabaseUrl',
			type: 'string',
			placeholder: 'https://YOUR_PROJECT.supabase.co',
			description:
				'Your Supabase project URL (HTTPS origin only—no trailing path). Requests go to `/functions/v1/...`.',
			required: true,
			default: '',
		},
		{
			displayName: 'Supabase Anonymous Key',
			name: 'supabaseAnonKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'Sent as the `apikey` header on every Edge request (publishable anon key—same as the app front-end).',
		},
		{
			displayName: 'API Key or JWT (Bearer)',
			name: 'apiKeyBearer',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'Used as `Authorization: Bearer …`. For automation prefer a Ghostsign programmatic key (`gc_live_…`).',
		},
	];

	test: ICredentialTestRequest = {
		request: {
			method: 'POST',
			url: "={{ (($credentials.supabaseUrl || '').toString()).trim().replace(/\\/$/, '') + '/functions/v1/ghostsign-api' }}",
			headers: {
				Authorization: '=Bearer {{$credentials.apiKeyBearer}}',
				apikey: '={{$credentials.supabaseAnonKey}}',
			},
			body: {
				op: 'organizations.list',
				include_archived: false,
			},
			json: true,
		},
		rules: [
			{
				type: 'responseCode',
				properties: {
					value: 200,
					message:
						'Could not reach Ghostsign — verify URL, anon `apikey`, Bearer token or JWT, scopes (`ghostsign:org:read` for this test), and rate limits.',
				},
			},
		],
	};
}

export default GhostsignApi;
