# Story 2.3: Manage Printify Integration (Status, Rotate Token, Disconnect)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a merchant,
I want to manage my Printify integration (status, token rotation, disconnect) and the active Printify shop selection,
so that Printify-required flows stay reliable and I can recover quickly without support.

## Acceptance Criteria

1. **Given** the shop is connected to Printify
   **When** the merchant views the Printify integration screen (`/app/printify`)
   **Then** they can see current connection status
   **And** they can see the selected Printify shop/account (if set)

2. **Given** the merchant rotates their Printify API token
   **When** they update the token in the app and save
   **Then** the app validates the new token against Printify and replaces the stored token securely
   **And** if the previously selected `printify_shop_id` is no longer valid for the new token, the app prompts the merchant to re-select an active shop

3. **Given** the merchant disconnects Printify
   **When** they confirm disconnect
   **Then** the stored token is removed and status becomes `Not connected`
   **And** Printify-required flows become blocked until reconnected

## Tasks / Subtasks

- [x] Add explicit disconnect flow (AC: 3)
  - [x] Extend `app/schemas/admin.ts` with a `printify_disconnect` intent (discriminated union)
  - [x] Update `app/routes/app.printify.tsx` `action` to handle disconnect by clearing the integration and returning a success payload
  - [x] Make disconnect idempotent server-side (no 500 if already disconnected)
  - [x] Add UI: a clear "Disconnect" button with confirmation (e.g., checkbox + confirm CTA) when connected

- [x] Improve token rotation behavior (AC: 2)
  - [x] When connected and a new token yields multiple shops, auto-select the previously saved `printify_shop_id` if it exists; otherwise prompt selection
  - [x] Keep existing multi-shop selection UX (action returns `needsSelection: true` + `shops` list)
  - [x] Ensure rotate does not log or return any secret token value

- [x] Ensure status/selected shop display remains correct (AC: 1)
  - [x] Keep showing the active shop title/id and sales channel when connected
  - [x] Keep the "connection invalid" banner behavior when the token/shop becomes invalid (loader clears integration)

- [x] Tests (AC: 1–3)
  - [x] Add small unit tests for any new selection/idempotency helper logic (prefer pure functions)
  - [x] If route-level behavior is complex, add a focused integration-style test for the `action` branch that clears integration (mock Prisma)

- [x] Telemetry + logging
  - [x] Log only safe fields (`shop_id`, `printify_shop_id`, intent outcome); never log the token
  - [x] Keep error payloads consistent (use `{ error: { code, message, details? } }` for failures)

## Dev Notes

### Developer Context (What’s tricky / what to avoid)

- The Printify API token is a credential: never expose it to the browser, never log it, and never store it in plaintext. Keep all Printify HTTP calls server-side (Printify does not support CORS).
- Disconnect must be **idempotent**: users can double-click, browsers can retry, and web apps can re-submit forms. Treat "disconnect" as safe to repeat.
- Token rotation should not silently change the selected Printify shop when possible. If the new token has access to multiple shops:
  - Prefer keeping the currently-saved `printify_shop_id` if it still exists.
  - Otherwise prompt the merchant to select the active shop.
- Keep status server-derived (based on persisted integration + validation) and avoid "fake connected" UI.

### Technical Requirements (Developer Guardrails)

- **Validation call:** reuse existing Printify validation via `listPrintifyShops()` (`GET https://api.printify.com/v1/shops.json` with `Authorization: Bearer <token>` and `User-Agent`).
- **Disconnect behavior:** clearing the integration must remove encrypted token material and shop selection.
  - Prefer `deleteMany({ where: { shop_id } })` or equivalent to avoid throwing if already disconnected.
- **Error shape:** failures should use `{ error: { code, message, details? } }` and must not include the raw token.

### Architecture Compliance

- Keep route/service boundaries: `app/routes/*` handles HTTP; `app/services/*` owns Printify + DB integration.
- Keep naming/contracts: DB and payloads `snake_case`; internal TS `camelCase`.
- Keep TypeScript `strict: true`; ESM only.

### Library / Framework Requirements

- Do not introduce a new server framework or HTTP client library; use existing patterns (`fetch`, Zod, `react-router` actions/loaders).
- Admin UI: stick with existing Polaris web components (`<s-*>`) used in `app/routes/app.printify.tsx`.

### File Structure Requirements

- Primary route: `app/routes/app.printify.tsx` (add disconnect UI + action branch; improve token rotation shop selection).
- Schema: `app/schemas/admin.ts` (add `printify_disconnect` intent).
- Persistence: `app/services/printify/integration.server.ts` (make clearing integration idempotent if needed).
- Gating helper stays in place: `app/services/printify/require-printify.server.ts` (Printify-required flows redirect to `/app/printify`).

### Testing Requirements

- Co-locate any new unit tests next to the helper under test (`*.test.ts`).
- Prefer unit tests for:
  - shop auto-selection logic on rotation
  - idempotent disconnect behavior (no throw when missing)

### Git Intelligence (recent patterns)

- Recent commits (most recent first):
  - `e436bde` feat: Add `requirePrintifyIntegration` to enforce Printify shop selection
  - `884ce91` implement 2-2 without bmad
  - `beb6c7d` 2-1 connect printify
  - `eff93e0` Enable Printify integration setup and billing redirect
  - `ee933ac` minor setup fix
- Patterns in those commits:
  - Printify UI lives in `app/routes/app.printify.tsx`
  - Printify logic lives in `app/services/printify/*`
  - Admin action inputs validated in `app/schemas/admin.ts`
  - Critical helpers covered by co-located tests in `app/services/printify/*.test.ts`

### Previous Story Intelligence (2.1)

- Story 2.1 established:
  - encrypted-at-rest token storage using `PRINTIFY_TOKEN_ENCRYPTION_KEY`
  - server-side token validation + multi-shop selection prompt
  - loader behavior that clears integration when token/shop becomes invalid

### Latest Tech Information

- Printify API base URL: `https://api.printify.com/v1/`.
- Token auth: `Authorization: Bearer <token>`; Printify expects a `User-Agent` header.
- Personal access tokens can expire (plan for rotation flow).

### Story Completion Status

- This story is complete when:
  - The Printify screen shows Connected/Not connected and, when connected, the selected Printify shop details.
  - Updating the token validates it and updates the encrypted token at rest.
  - Disconnect clears the integration reliably (idempotent) and Printify-required flows redirect to `/app/printify` until reconnected.
  - No secrets are logged; error envelopes remain consistent.

### Project Structure Notes

- Follow the existing Printify integration layout established in 2.1:
  - Route: `app/routes/app.printify.tsx`
  - Services: `app/services/printify/*`
  - Validation: `app/schemas/admin.ts`
- Avoid introducing a second Printify settings route; keep `/app/printify` as the single source of truth for connect/rotate/disconnect.
- Ensure DB updates remain tenant-scoped by `shop_id` (see `shopPrintifyIntegration` usage in `app/services/printify/integration.server.ts`).

### References

- Story requirements + acceptance criteria: `_bmad-output/planning-artifacts/epics.md` (Epic 2 → Story 2.3)
- Architecture decisions (boundaries, naming, error envelope, security): `_bmad-output/planning-artifacts/architecture.md`
- Global dev guardrails: `AGENTS.md` and `_bmad-output/project-context.md`
- Existing Printify integration implementation: `app/routes/app.printify.tsx`, `app/services/printify/client.server.ts`, `app/services/printify/integration.server.ts`, `app/services/printify/token-encryption.server.ts`
- Existing admin action validation patterns: `app/schemas/admin.ts`
- Prior story context: `_bmad-output/implementation-artifacts/2-1-connect-printify-via-api-token-validate-status.md`

## Dev Agent Record

### Agent Model Used

Antigravity (Gemini)

### Debug Log References

No debug issues encountered.

### Completion Notes List

- Added `printify_disconnect` intent to discriminated union in `admin.ts`
- Made `clearPrintifyIntegration` idempotent using `deleteMany` instead of `delete`
- Added disconnect action handler with proper logging of safe fields only
- Improved token rotation: auto-selects previously saved shop when it still exists for new token
- Added disconnect UI section with confirmation checkbox and critical-tone button
- Created `selectPrintifyShop` pure helper function for testable shop selection logic
- Added 8 unit tests for shop selection logic covering all edge cases
- All existing tests continue to pass (58 total)

### File List

- app/schemas/admin.ts (modified)
- app/routes/app.printify.tsx (modified)
- app/services/printify/integration.server.ts (modified)
- app/services/printify/shop-selection.server.ts (new)
- app/services/printify/shop-selection.server.test.ts (new)

### Change Log

- 2026-01-14: Implemented Story 2.3 - disconnect flow, token rotation improvement, unit tests
