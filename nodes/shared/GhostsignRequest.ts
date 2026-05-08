import type {
	ICredentialDataDecryptedObject,
	IDataObject,
	IHttpRequestOptions,
} from 'n8n-workflow';

import type { GhostsignApiCredentialData } from '../../credentials/GhostsignApi.credentials';

export type MinimalHttpHelpers = {
	httpRequest(opts: IHttpRequestOptions): Promise<unknown>;
};

export function coerceGhostsignCredentials(raw: ICredentialDataDecryptedObject): GhostsignApiCredentialData {
	const supabaseUrl = typeof raw.supabaseUrl === 'string' ? raw.supabaseUrl.trim() : '';
	const supabaseAnonKey =
		typeof raw.supabaseAnonKey === 'string' ? raw.supabaseAnonKey.trim() : '';
	const apiKeyBearer = typeof raw.apiKeyBearer === 'string' ? raw.apiKeyBearer.trim() : '';

	if (!supabaseUrl || !supabaseAnonKey || !apiKeyBearer) {
		throw new TypeError(
			'Ghostsign credential is incomplete (Supabase URL, anon key, and Bearer token required).',
		);
	}

	const parsed = new URL(supabaseUrl);
	const host = parsed.hostname;

	const proto = parsed.protocol;

	const isLocal =
		host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local') || host === '[::1]';

	if (proto !== 'https:' && !(proto === 'http:' && isLocal)) {
		throw new TypeError('Supabase URL must use https (http allowed only for localhost hosts).');
	}

	return {
		supabaseUrl: supabaseUrl.replace(/\/+$/, ''),
		supabaseAnonKey,
		apiKeyBearer,
	};
}

export function ghostsignFunctionsBase(cred: GhostsignApiCredentialData): string {
	return `${cred.supabaseUrl}/functions/v1`;
}

/** POST JSON body to `{base}/functions/v1/{edgeName}`. Returns parsed JSON. */
export async function ghostsignEdgePostJson(
	h: MinimalHttpHelpers,
	cred: GhostsignApiCredentialData,
	edgeName: string,
	body: IDataObject,
): Promise<unknown> {
	const url = `${ghostsignFunctionsBase(cred)}/${edgeName.replace(/^\//, '')}`;

	return await h.httpRequest({
		method: 'POST',
		url,
		headers: {
			Authorization: `Bearer ${cred.apiKeyBearer}`,
			apikey: cred.supabaseAnonKey,
		},
		body,
		json: true,
	});
}

export function parseJsonObject(raw: string, label: string): IDataObject | undefined {
	const trimmed = raw.trim();

	if (trimmed === '') {
		return undefined;
	}

	const v: unknown = JSON.parse(trimmed);

	if (typeof v !== 'object' || v === null || Array.isArray(v)) {
		throw new SyntaxError(`${label}: expected JSON object`);
	}

	return v as IDataObject;
}

export function parseJsonValue(raw: string): unknown | undefined {
	const trimmed = raw.trim();

	if (trimmed === '') {
		return undefined;
	}

	return JSON.parse(trimmed) as unknown;
}
