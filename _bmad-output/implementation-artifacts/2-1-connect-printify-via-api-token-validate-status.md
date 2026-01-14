# Story 2.1: Connect Printify via API Token (Validate + Status)

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a merchant,
I want to connect my Printify account via an API token,
so that the app can generate mockups and automate fulfillment later.

## Acceptance Criteria

1. **Given** the merchant opens the Printify integration screen
   **When** they paste a Printify API token and click “Connect”
   **Then** the system validates the token by calling Printify
   **And** if valid, saves the integration for the shop (token stored securely) and shows status `Connected`

2. **Given** the token is invalid/expired
   **When** the merchant clicks “Connect”
   **Then** the integration is not saved
   **And** the UI shows a clear error and remains `Not connected`

3. **Given** the shop is connected to Printify
   **When** the merchant returns to the integration screen
   **Then** they see `Connected` status and basic shop info (enough to confirm it’s the right account)

4. **Given** the shop is not connected to Printify
   **When** the merchant tries to access flows that require Printify (e.g., product setup preview/mockups/fulfillment-related actions)
   **Then** the app blocks that action and shows “Connect Printify first” with a link to the integration screen
   **And** template creation/testing remains available without Printify

## Tasks / Subtasks

- [x] Implement Printify integration persistence + security (AC: 1–2)
  - [x] Add Prisma model + migration for per-shop Printify credentials (encrypted at rest)
  - [x] Add server-side encrypt/decrypt helper using an env key (no plaintext tokens in DB or logs)

- [x] Add Printify integration admin route (AC: 1–3)
  - [x] Update `app/routes/app.printify.tsx` to render status + token form
  - [x] Add `action` handler using shared Zod schema (`app/schemas/admin.ts`)
  - [x] Validate token via Printify API and store connection info on success

- [x] Wire "Connected" status into readiness + gating (AC: 4)
  - [x] Update `app/services/shops/readiness.server.ts` to compute `printifyConnected` from stored integration
  - [x] Ensure Printify-required flows check `printifyConnected` server-side and block with a link

- [x] Add tests for pure helpers and critical mapping (AC: 1–4)
  - [x] Unit test encrypt/decrypt helper round-trip and failure modes
  - [x] Unit test readiness logic for Printify connected/not connected

## Dev Notes

### Developer Context (What’s tricky / what to avoid)

- The Printify API token is a credential; never expose it to the browser, never log it, and never store it in plaintext.
- Printify’s API does **not** support CORS, so all Printify calls must happen server-side.
- This story is the foundation for multiple later flows (mockups, fulfillment). Keep the integration model tenant-scoped (`shop_id`) and designed for rotation/disconnect (Epic 2.3).
- The repo currently has a placeholder Printify setup route (`app/routes/app.printify.tsx`) and readiness is hard-coded to `printifyConnected: false` (`app/services/shops/readiness.server.ts`). Update these without breaking onboarding gating.
- Avoid “fake connected” UI: only show `Connected` when the token was validated successfully.

### Technical Requirements (Developer Guardrails)

- **Validation call:** validate token by calling Printify `GET https://api.printify.com/v1/shops.json` with `Authorization: Bearer <token>` and a `User-Agent` header.
  - Success: HTTP 200 with an array of shops (`id`, `title`, `sales_channel`).
  - Invalid/expired: HTTP 401/403 → do not save integration; show a clear error.
  - Rate limit: handle `429` with a calm retryable message.
- **Secure storage:** store the token encrypted at rest.
  - Recommended: AES-256-GCM with random IV; key from env (e.g. `PRINTIFY_TOKEN_ENCRYPTION_KEY`, 32-byte base64).
  - Store `ciphertext`, `iv`, and `auth_tag` (or a single packed string) in DB fields using `snake_case` names.
  - Fail closed if encryption key is missing/misconfigured.
- **Form/action validation:** add a Zod schema to `app/schemas/admin.ts` for the Printify connect action (use `snake_case` form fields like `printify_api_token`, discriminated by `intent`).
- **Readiness + gating:** derive `printifyConnected` from persisted integration state (validated token exists) and use it for server-side gating.
  - Any Printify-required flow must block with a "Connect Printify first" message + link to `/app/printify`.
  - Keep template creation/testing available without Printify.
- **Error shape:** for route actions, return `{ error: { code, message, details? } }` consistently; never include the raw token in `details`.

### Architecture Compliance

- Keep the Shopify React Router template patterns; do not add a parallel API server.
- Keep route/service boundaries:
  - `app/routes/*` owns HTTP + loader/action handling.
  - `app/services/*` owns third-party integrations and DB access helpers; services must not import routes.
- Maintain naming/contracts:
  - DB + wire payloads: `snake_case`.
  - Internal TS: `camelCase`, map at boundaries.
  - Error envelope: `{ error: { code, message, details? } }`.
- Do not add any dev-bypass/backdoor for Printify; this is an admin-only integration surface.

### Library / Framework Requirements

- TypeScript stays `strict: true`; keep ESM (`import`/`export`).
- Prefer built-in `fetch` (Node 20+) for HTTP calls; avoid adding a new HTTP client dependency.
- Use Zod (`app/schemas/*`) for boundary validation; do not hand-roll validation.
- Follow existing admin UI patterns with Polaris web components (`<s-*>`).
- Do not change dependency versions for this story; use `package.json` pins.

### File Structure Requirements

- Admin route: update existing `app/routes/app.printify.tsx` (path: `/app/printify`).
- Validation schema: extend `app/schemas/admin.ts` with a Printify action schema.
- Integration service: add `app/services/printify/*` (e.g. `client.server.ts`, `shops.server.ts`, `token-encryption.server.ts`).
- Readiness wiring: update `app/services/shops/readiness.server.ts` to compute `printifyConnected` from persisted integration state.
- Prisma schema/migration: update `prisma/schema.prisma` and add a migration under `prisma/migrations/`.
- Keep any shared helper (e.g. encryption) in `app/lib/*` only if it’s not provider-specific; otherwise keep it under `app/services/printify/*`.

### Testing Requirements

- Add unit tests (Vitest) for pure logic and boundary helpers:
  - Encrypt/decrypt helper round-trip + invalid key handling.
  - Printify token validation helper: mock `fetch` to assert correct headers (Authorization + User-Agent) and status handling.
  - Readiness signal mapping: `printifyConnected` true/false based on persisted integration record.
- Co-locate `*.test.ts` next to the module under test; follow existing test patterns (e.g. `app/services/shopify/billing.server.test.ts`).

### Latest Tech Information

- Printify API base URL: `https://api.printify.com/v1/`.
- Personal Access Token auth: `Authorization: Bearer <token>`.
- Printify requires a `User-Agent` header on requests.
- Rate limits (global): 600 requests/minute per integration; Catalog endpoints also have a separate 100 requests/minute limit.
- Printify API does not support CORS; requests must be server-side.
- Token lifecycle: personal access tokens expire after ~1 year (plan for rotate flow in Epic 2.3).

Source: Printify API docs (Overview + Authentication)

### Project Context Reference

- Global agent/implementation guardrails: `AGENTS.md` and `_bmad-output/project-context.md`.
- Architecture decisions (boundaries, naming, proxy rules, billing safety): `_bmad-output/planning-artifacts/architecture.md`.
- Requirements + UX intent: `_bmad-output/planning-artifacts/epics.md`, `_bmad-output/planning-artifacts/prd.md`, `_bmad-output/planning-artifacts/ux-design-specification.md`.

### Story Completion Status

- This story is complete when:
  - The merchant can connect with a token, the server validates it against Printify, and the token is stored encrypted.
  - The integration screen reliably shows `Connected`/`Not connected` with basic shop info when connected.
  - `printifyConnected` is server-derived (no hardcoded false) and Printify-required flows block with a link when not connected.
  - No secrets are logged or returned in responses; tests cover the critical helpers.

### Project Structure Notes

- The architecture doc proposes `app/services/printify/*`, but the repo currently only contains `app/services/shopify/*` and `app/services/shops/*`. Create the Printify service folder and keep all Printify HTTP logic there.
- `app/routes/app.printify.tsx` exists as a placeholder; update in place (do not create a new route name) so existing readiness links keep working.
- Prisma schema currently uses `snake_case` field names and `@@map(...)` table mappings; follow that pattern for new tables/columns.

### References

- Story requirements + acceptance criteria: [Source: `_bmad-output/planning-artifacts/epics.md` → Epic 2 → Story 2.1]
- Integration scope and constraints: [Source: `_bmad-output/planning-artifacts/prd.md` → “Integrations: Supplier Fulfillment (MVP: Printify)”]
- Architecture boundaries + naming + validation rules: [Source: `_bmad-output/planning-artifacts/architecture.md` → “Service Boundaries”, “API & Communication Patterns”, “Billing Safety & Idempotency”]
- UX tone for errors and deterministic recovery: [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` → “Feedback Patterns”]
- Existing placeholder route: [Source: `app/routes/app.printify.tsx`]
- Readiness wiring (currently stubbed): [Source: `app/services/shops/readiness.server.ts`]
- Checklist item wiring: [Source: `app/lib/readiness.ts`]
- Printify API docs: [Source: https://developers.printify.com/ → Authentication, Shops]

## Dev Agent Record

### Agent Model Used

GPT-5.2 (Codex CLI)

### Debug Log References

- Test run: `npm test -- app/services/printify/token-encryption.server.test.ts app/services/printify/client.server.test.ts app/services/shops/readiness.server.test.ts app/lib/readiness.test.ts`
- Test run: `npm test`
- Test run: `npm test -- app/services/printify/token-encryption.server.test.ts app/services/printify/client.server.test.ts`
- Test run: `npm test -- app/services/printify/client.server.test.ts`

### Completion Notes List

- Added encrypted Printify token storage with Prisma model + migration.
- Implemented Printify validation client with header handling and error mapping.
- Updated Printify setup route to show status, shop info, and connect form.
- Wired readiness signals to stored integration and added a Printify link in onboarding.
- Tests: `npm test -- app/services/printify/token-encryption.server.test.ts app/services/printify/client.server.test.ts app/services/shops/readiness.server.test.ts app/lib/readiness.test.ts`, `npm test`.
- Review fixes: Masked token input, hardened Printify response parsing, expanded crypto failure-mode tests, and surfaced multi-shop token warning.
- Multi-shop selection: prompt for shop selection when a token returns multiple Printify shops.

### File List

- \_bmad-output/implementation-artifacts/2-1-connect-printify-via-api-token-validate-status.md
- app/lib/readiness.test.ts
- app/routes/app.\_index.tsx
- app/routes/app.printify.tsx
- app/schemas/admin.ts
- app/services/printify/client.server.test.ts
- app/services/printify/client.server.ts
- app/services/printify/integration.server.ts
- app/services/printify/token-encryption.server.test.ts
- app/services/printify/token-encryption.server.ts
- app/services/shops/readiness.server.test.ts
- app/services/shops/readiness.server.ts
- prisma/migrations/20260114121758_add_printify_integration/migration.sql
- prisma/schema.prisma

### Change Log

- 2026-01-14: Rebuilt Printify integration storage, validation, setup UI, and tests.
- 2026-01-14: Senior dev review fixes: validated Printify payload shape, masked token input, expanded encryption failure-mode tests, and added multi-shop warning.
- 2026-01-14: Added multi-shop selection flow for Printify connect.

## Senior Developer Review (AI)

**Reviewer:** Kevin
**Date:** 2026-01-14
**Outcome:** Changes requested

### What I validated

- Token validation happens server-side via Printify `GET /v1/shops.json` with `Authorization: Bearer …` and `User-Agent`.
- Token is encrypted at rest using AES-256-GCM with key from `PRINTIFY_TOKEN_ENCRYPTION_KEY`.
- UI shows `Connected` / `Not connected` and displays basic shop info when connected.

### Fixes applied during review

- Hardened Printify response handling (schema validation + network error handling).
- Expanded encryption tests to cover tampering/wrong-key failure modes.
- Masked the Printify API token input field.
- Surfaced a warning when a token has access to multiple Printify shops.
- Added a multi-shop selection prompt before saving the integration.

### Remaining concerns

- Prisma is currently configured for SQLite in `prisma/schema.prisma`; confirm production DB strategy (Supabase Postgres) and ensure migrations match it.
- AC4 references blocking “Printify-required flows” (mockups/fulfillment/etc.). Those flows don’t exist in this codebase yet, so this requirement can’t be fully validated here.
