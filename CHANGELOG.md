## 0.1.10

- Added **Ghostsign Actions › Signing › Send Reminder** (`signingReminder` → `ghostsign-send-for-signature` with `reminder_only`) for pending signers on `out_for_signature` projects.
- **Signing › Send Invite** and **Send Reminder** support optional **Invite Note** and **Signing Link Expires In (Days)**.

## 0.1.9

- Fixed **Ghostsign Actions › AI › Chat With Project** endpoint routing (`projectChat` now maps to `ghostsign-project-chat`).
- Added **Ghostsign Actions › Preview › Send Review Links** (`ghostsign-proposal-review-send`) with recipients JSON support.
- Added **Ghostsign Actions › Integrations › SMTP Test** (`ghostsign-smtp-test`) to verify saved workspace SMTP.
- Added **Ghostsign Actions** coverage for current template/workspace endpoints:
  - `ghostsign-ai-template-draft`
  - `ghostsign-publish-template-draft`
  - `ghostsign-ingest-template`
  - `ghostsign-clone-library-template`
  - `ghostsign-clone-workspace`

## 0.1.7

- **Ghostsign Actions › AI › Fill Variable**: expose **Variable Name** (`variableNameAi`) so the UI matches `ghostsign-ai-fill` (`project_id` + `variable_name`).

## 0.1.5

- **Ghostsign API** credential: single **API Key** field; fixed Supabase origin and publishable `apikey` ship in-package (same visibility as frontend `NEXT_PUBLIC_*` vars).

## 0.1.4

- Node icons updated (`Ghostsign`, `Ghostsign Actions`) to match brand ghost marks.

## 0.1.3

- Credential icons updated (`ghostsignApi.svg`, `ghostsignApi.dark.svg`).
