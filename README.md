# n8n-nodes-ghostsign

Ghostsign (proposal & e‑signature workflows on Supabase Edge) integrations for **[n8n](https://n8n.io)** — programmatic keys (`gc_live_…`) plus the Supabase **`apikey`** header. English‑only strings follow verified community‑node conventions.

## Install

Community nodes (`Settings → Community nodes`):

```
n8n-nodes-ghostsign
```

Alternatively `npm install n8n-nodes-ghostsign` into a custom Docker image alongside n8n’s installation instructions.

## Credential

Use **Ghostsign API** credential:

| Field | Purpose |
| --- | --- |
| **Supabase URL** | HTTPS origin (`https://<project-ref>.supabase.co`) |
| **Supabase anon key** | Sent as header `apikey` on every POST |
| **API key / JWT** | Goes in `Authorization: Bearer …`; automation keys must include scopes for the chosen operations |

Mis-scoped keys return **403**. **429** may include `Retry-After` — add Wait / Retry for batch mail (`ghostsign-send-for-signature`, `ghostsign-resend-finalize-email`).

## Nodes

### Ghostsign

Calls **`POST …/ghostsign-api`** (`op` in JSON body) — workspaces, templates, proposals, previews, signer configuration.

### Ghostsign Actions

Named Edge helpers: signing invites, finalized PDF emails, **`ghostsign-ai-fill`**, previews, embeddings, SMTP + webhook upserts.

## Upstream docs

- [Ghostsign HTTP integration matrix](https://github.com/ghostcoded/ghostcoded-proposal-tool/blob/main/docs/api-integration-guide.md)
- [OpenAPI (Edge)](https://github.com/ghostcoded/ghostcoded-proposal-tool/blob/main/docs/openapi-ghostsign-api.yaml)

## Development

```
npm ci
npm run lint
npm run build
npm run dev   # local n8n with this package linked
```

## Publishing

Trusted publishing expects GitHub Actions + npm OIDC (see [.github/workflows/publish.yml](.github/workflows/publish.yml)). Configure npm **Trusted Publishers** or set `NPM_TOKEN`, then bump via `npm run release`.
# n8n-nodes-ghostsign
