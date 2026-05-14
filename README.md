# n8n-nodes-ghostsign

Ghostsign (proposal & e‑signature workflows on Supabase Edge) integrations for **[n8n](https://n8n.io)** — programmatic keys (`gc_live_…`) plus the Supabase **`apikey`** header. English‑only strings follow verified community‑node conventions.

## Install

Community nodes (`Settings → Community nodes`):

```
n8n-nodes-ghostsign
```

Alternatively `npm install n8n-nodes-ghostsign` into a custom Docker image alongside n8n’s installation instructions.

If install spins then errors with **“Class could not be found”**, n8n may still have stale files under the community‑nodes folder. Stop n8n, remove `nodes/node_modules` (and orphaned `package.json`/`package-lock.json` at that level per [n8n host notes](https://www.hostinger.com/support/the-specified-package-could-not-be-loaded-when-using-n8n-community-nodes/)), restart, and install again. Docker: wipe `…/.n8n/nodes/` contents for the container user accordingly.

## Credential

Use **Ghostsign API** credential (only asks for):

| Field | Purpose |
| --- | --- |
| **API key** | Ghostsign programmatic key (`gc_live_…`); scopes must match chosen operations |

The Supabase project URL and publishable **`apikey`** header are bundled with the package and are not editable in the credential form.

Mis-scoped keys return **403**. **429** may include `Retry-After` — add Wait / Retry for batch mail (`ghostsign-send-for-signature`, `ghostsign-resend-finalize-email`).

## Nodes

### Ghostsign

Calls **`POST …/ghostsign-api`** (`op` in JSON body) — workspaces, templates, proposals, previews, signer configuration.

### Ghostsign Actions

Named Edge helpers: signing invites, finalized PDF emails, proposal review links, **`ghostsign-ai-fill`**, **`ghostsign-project-chat`**, previews, embeddings, SMTP tests, template ingest/clone/draft publish, workspace clone, and SMTP/webhook upserts.

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

See **[PUBLISHING.md](./PUBLISHING.md)** for npm/GitHub Actions release steps (`NPM_TOKEN` vs Trusted Publishing, semver tags, and provenance).
