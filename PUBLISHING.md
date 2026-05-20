# Publishing `n8n-nodes-ghostsign` to npm

This repo is published as a **public** npm package with **`npm publish` provenance** from **GitHub Actions** (required for verified community-node expectations as of May 2026).

## Prerequisites

- **npm account** with permission to publish the package name **`n8n-nodes-ghostsign`** (or scoped name if you change it later).
- **GitHub repo** wired to `origin`; Actions enabled.
- **Local**: Node LTS, `npm ci` works; `@n8n/node-cli` in devDependencies satisfies the range used by CI (check with `npm list @n8n/node-cli`; upgrade if publishes fail with provenance/tooling errors).

`package.json` already includes **`publishConfig.access`: `"public"`** (needed for provenance on a brand‑new package).

## One‑time npm authentication with GitHub Actions

Pick **one** approach.

### Option A — Trusted Publishing (OIDC, no long-lived secret)

1. Sign in at [npmjs.com](https://www.npmjs.com) → **n8n-nodes-ghostsign** → **Publishing access / Trusted Publishers**.
2. Link **GitHub Actions** → owner **`Ghostcoded-2025`**, repo **`n8n-nodes-ghostsign`**, workflow file **`publish.yml`**.
3. **Delete** the **`NPM_TOKEN`** repo secret and change **`publish.yml`** to use `setup-node` with `registry-url` only (no manual token step). This repo currently ships with **Option B** because that is what published **0.1.10**.

### Option B — Automation token (`NPM_TOKEN`) — **current workflow**

1. npm → **Access tokens** → **Generate New Token** → **Classic → Automation** (or granular with **publish** on **`n8n-nodes-ghostsign`**).
2. GitHub repo → **Settings → Secrets and variables → Actions** → secret **`NPM_TOKEN`** — paste the new token.
3. Re-run **Publish** (push the semver tag again, or **Actions → Publish → Run workflow** with tag **`0.1.11`**).

If the token expires, **`npm whoami`** in CI fails or publish returns **`404 Not Found`** even though the package exists. Regenerate the token and update the secret.

If publishes fail with **403** citing **two‑factor authentication**, the token cannot publish unattended—use **Automation**, or granular with bypass for publishing.

### Troubleshooting `404` on publish

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `404 Not Found` on `PUT …/n8n-nodes-ghostsign` | Expired/wrong **`NPM_TOKEN`** | Regenerate npm **Automation** token; update **`NPM_TOKEN`** secret; re-run **Publish** |
| `Verify npm credentials` fails | Secret missing or revoked | Set **`NPM_TOKEN`** (Option B) or switch to Trusted Publishing (Option A) |
| `403` / 2FA | Granular token without publish automation | Use **Automation** token |
| Workflow green but npm still on old version | Tag did not match `*.*.*` | Push semver tag without `v` prefix (e.g. `0.1.11`) |

## What triggers a publish?

Workflow **Publish** runs on **`git push`** of a **semver tag** matching `*.*.*` (examples: **`0.1.3`**, **`1.0.0`**, **`2.0.0-rc.1`**).

Tags with a **`v`** prefix (**`v1.2.3`**) do **not** match unless you edit the workflow pattern to `v*.*.*`.

Pushing **`main`** alone only runs CI (lint/build), **not** npm publish.

## Standard release workflow

1. On **`main`**, merge or commit what you intend to ship; ensure **`npm run lint`** and **`npm run build`** succeed.
2. Bump **`version`** in [`package.json`](package.json); update **`package-lock.json`** with `npm install` if you changed dependencies.
3. Commit, e.g. `chore: release 0.1.4`.
4. Create and push a tag (**no `v` prefix**):

   ```bash
   git tag 0.1.4            # replace with new version
   git push origin main
   git push origin 0.1.4
   ```

5. Open **GitHub → Actions → Publish** and confirm the run for that tag succeeds. Check [npm package page](https://www.npmjs.com/package/n8n-nodes-ghostsign).

### Re‑run CI without bumping git

If npm auth was wrong and CI failed, fix secrets / Trusted Publisher, then **Re-run workflow** on the failed job in GitHub Actions (no tag change).

### Replacing an existing remote tag

Only if nothing good was published yet: delete remote tag (`git push origin :refs/tags/X.Y.Z`), retag locally, push again—not needed for normal semver bumps.

### Local `npm run release`

On **your machine**, `npm run release` (**`n8n-node release`**) drives **release‑it**: bump/changelog/tag/push (**it does not publish to npm by default**, by design—you publish from Actions).

Inside **GitHub Actions**, **`GITHUB_ACTIONS`** causes **`n8n-node release`** to **only** `lint`, `build`, and **`npm publish`** with **`NPM_CONFIG_PROVENANCE=true`**—that is how this repo ships releases.

## After publish

Give npm a minute, then verify:

```bash
npm view n8n-nodes-ghostsign version
```

Optional: install tarball locally with **`--omit=peer`** (similar to community-node installs) using the steps you used when debugging loads.

---

For end‑user Docker / stale‑install cleanup after a bad install attempt, see the **Install** notes in [`README.md`](README.md).
