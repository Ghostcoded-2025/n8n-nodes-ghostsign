import type { ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

import { GHOSTSIGN_SUPABASE_PUBLISHABLE_KEY, GHOSTSIGN_SUPABASE_URL } from './ghostsignPublicConfig';

export type GhostsignApiCredentialData = {
	supabaseUrl: string;
	supabaseAnonKey: string;
	apiKeyBearer: string;
};

const ghostsignApiTestUrl =
	`${GHOSTSIGN_SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/ghostsign-api`;

export class GhostsignApi implements ICredentialType {
	name = 'ghostsignApi';

	displayName = 'Ghostsign API';

	icon = { light: 'file:ghostsignApi.svg', dark: 'file:ghostsignApi.dark.svg' } as const;

	documentationUrl = 'https://github.com/ghostcoded/n8n-nodes-ghostsign#credential';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKeyBearer',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description: 'Ghostsign programmatic key (`gc_live_…`) with scopes for these operations (`ghostsign:ai:chat` for Project Chat; `ghostsign:ai:write` for Fill Variable).',
		},
	];

	test: ICredentialTestRequest = {
		request: {
			method: 'POST',
			url: ghostsignApiTestUrl,
			headers: {
				Authorization: '=Bearer {{$credentials.apiKeyBearer}}',
				apikey: GHOSTSIGN_SUPABASE_PUBLISHABLE_KEY,
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
						'Could not reach Ghostsign — verify API key, scopes (`ghostsign:org:read` for this test), network, and rate limits.',
				},
			},
		],
	};
}

export default GhostsignApi;
