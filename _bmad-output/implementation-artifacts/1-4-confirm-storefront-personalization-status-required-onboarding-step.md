# Story 1.4: Confirm Storefront Personalization Status (Required Onboarding Step)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a merchant,
I want to explicitly enable or keep disabled the storefront personalization experience for my shop,
so that I control whether buyers can access personalization on my storefront.

## Acceptance Criteria

1. **Given** the merchant is completing onboarding
   **When** they reach the “Storefront personalization” step
   **Then** the app shows a shop-level setting with a clear choice to **Enable** or **Keep disabled**
   **And** the default state is **Disabled** until the merchant explicitly enables it

2. **Given** the merchant tries to finish onboarding without explicitly confirming this setting
   **When** they attempt to proceed
   **Then** onboarding is blocked
   **And** the “Storefront personalization” checklist item remains `Incomplete`

3. **Given** the merchant explicitly enables storefront personalization
   **When** they confirm
   **Then** the system checks spend safety prerequisites (monthly cap configured + paid usage consent recorded)
   **And** if prerequisites are not met, enabling is blocked with a clear message and a link to configure spend safety
   **And** if prerequisites are met, the system saves `storefront_personalization_enabled = true` for the shop
   **And** the “Storefront personalization” checklist item becomes `Complete`
   **And** the UI clarifies that storefront personalization may still require additional setup (e.g., templates assigned to products) before buyers can successfully generate

4. **Given** the merchant explicitly keeps storefront personalization disabled
   **When** they confirm
   **Then** the system saves `storefront_personalization_enabled = false` for the shop
   **And** the “Storefront personalization” checklist item becomes `Complete`

## Tasks / Subtasks

- [x] Add onboarding step UI + confirmation flow (AC: 1–2)
  - [x] Create route `app/routes/app.onboarding.storefront-personalization.tsx` (path: `/app/onboarding/storefront-personalization`)
  - [x] Render clear choice: **Enable** vs **Keep disabled** (default UI state = disabled)
  - [x] Prevent “Finish onboarding” until a choice is saved (server-authoritative)

- [x] Enforce spend safety prerequisite before enabling (AC: 3)
  - [x] Reuse server readiness signals (`getShopReadinessSignals(shop_id)`) to check cap + paid-usage consent
  - [x] If spend safety incomplete, block enabling and link to `/app/billing` (preserve embedded query params)

- [x] Persist `storefront_personalization_enabled` per shop (AC: 3–4)
  - [x] Add DB field + service helpers (keep Prisma + `snake_case` naming)
  - [x] Ensure “Keep disabled” writes `false` explicitly

- [x] Wire into onboarding checklist + access gating (AC: 2–4)
  - [x] Add/extend readiness item `storefront_personalization` with correct `Complete/Incomplete` state
  - [x] Ensure the dashboard/checklist links to this onboarding step when incomplete
  - [x] Keep all embedded links using `buildEmbeddedSearch`

- [x] Tests
  - [x] Update `app/lib/readiness.test.ts` to cover the action link + completion state behavior
  - [x] Add focused unit tests for any new pure helpers (e.g., mapping readiness → CTA)

## Dev Notes

### Developer Context (What’s tricky / what to avoid)

- This is a hard gate: onboarding must not be “finishable” until the merchant explicitly confirms this setting.
- **Invariant:** do not break or bypass the existing access gate + `readinessItems` contract in `app/routes/app.tsx`; extend it, don’t replace it.
- Default must remain safe: treat `storefront_personalization_enabled` as **false** until proven otherwise.
- Enabling must be blocked unless spend safety is configured (cap + paid usage consent). Do not “soft-warn” here; it’s a prerequisite.
- Don’t introduce any dev bypass or new public endpoints here; this is embedded admin UX + server persistence only.

### UX Intent

- Make the decision explicit and calm: “Enable” vs “Keep disabled”.
- If blocked by spend safety, show a clear message and a deterministic next step (link to Billing/Spend Safety).
  - Suggested copy: “Before you can enable storefront personalization, set a monthly spending cap and enable paid usage.”
  - Suggested CTA label: “Configure spend safety” → `/app/billing`
- Clarify scope: enabling shop-level personalization doesn’t guarantee buyers can generate until templates are assigned to products.
  - Suggested helper text: “Next, assign a published template to a product to let buyers generate previews.”

### Technical Requirements

- Save `storefront_personalization_enabled` per shop, server-authoritatively.
- Spend safety prerequisites:
  - monthly cap configured (`monthly_cap` non-null and > 0)
  - paid usage consent recorded with timestamp
- Embedded admin navigation must preserve query params (`host`, `embedded`, `shop`, `locale`) via `buildEmbeddedSearch`.

### Architecture Compliance

- Keep Shopify React Router template patterns; no parallel REST server.
- Routes (`app/routes/*`) handle HTTP + loaders/actions; persistence/integrations live in `app/services/*`.
- TypeScript stays `strict: true`; use shared Zod schemas for any new boundary validation.
- Naming: internal `camelCase`, DB + wire payloads `snake_case`.
- Logging: pino JSON to stdout; PostHog only if you add new meaningful events (no secrets/PII).

### Library / Framework Requirements

- Admin UI: follow existing Polaris web component patterns used in current onboarding pages.
- Router: `react-router` v7 (per repo); don’t introduce new routing conventions.

### File Structure Requirements (Expected Touch Points)

- New onboarding step route: `app/routes/app.onboarding.storefront-personalization.tsx`
- Onboarding/dashboard checklist UI: `app/routes/app._index.tsx`
- Access gating + loader data source: `app/routes/app.tsx`
- Checklist mapping + action link: `app/lib/readiness.ts`
- Embedded query param helper: `app/lib/embedded-search.ts`
- Readiness signal source: `app/services/shops/readiness.server.ts`
- (If needed) New persistence service for shop setting: `app/services/shops/storefront-personalization.server.ts`
- (If needed) DB change: `prisma/schema.prisma` + new migration

### Testing Requirements

- Use existing `vitest` setup.
- Co-locate any new unit tests as `*.test.ts` next to the module.
- Prefer small unit tests for pure mapping/helpers; don’t add new test frameworks.

### Previous Story Intelligence

- Story 1.3 established the pattern for onboarding sub-routes and server-authoritative readiness completion:
  - Onboarding step route pattern: `app/routes/app.onboarding.spend-safety.tsx`
  - Readiness signals: `app/services/shops/readiness.server.ts`
  - Embedded search param preservation: `app/lib/embedded-search.ts`

### Git Intelligence Summary

- Recent work is focused on onboarding readiness + spend safety persistence; reuse those patterns instead of inventing new ones.

### Latest Tech Information

- React Router v7 positions itself as a non-breaking upgrade from v6 and adds stronger type safety (route typegen); keep existing template patterns and don’t introduce alternate routing frameworks.
- Shopify app tooling continues to evolve in `shopify-app-js`; for this story, use pinned versions from `package.json` (no upgrades) and follow the repo’s established auth + loader/action patterns.
- Use the repo’s current baseline versions (don’t upgrade inside this story): `react-router` `^7.12.0`, `@shopify/shopify-app-react-router` `^1.1.0`, `zod` `^4.3.5`, `prisma` `^6.16.3`.

### Project Context Reference

- Requirements: `_bmad-output/planning-artifacts/epics.md` (Epic 1 → Story 1.4)
- Spend safety prerequisite definition: `_bmad-output/planning-artifacts/prd.md` (Spend Safety / Consent)
- UX tone + deterministic recovery: `_bmad-output/planning-artifacts/ux-design-specification.md` (Feedback Patterns)
- Architecture constraints + folder boundaries: `_bmad-output/planning-artifacts/architecture.md`
- Agent guardrails: `AGENTS.md` and `_bmad-output/project-context.md`

### Story Completion Status

- This story is “done” when the onboarding step exists, the choice is persisted server-side, enabling is blocked until spend safety is configured, and the dashboard checklist reflects the correct `Complete/Incomplete` state.

### Project Structure Notes

- Alignment with unified project structure (paths, modules, naming)
- Detected conflicts or variances (with rationale)

### References

- Story requirements: [Source: `_bmad-output/planning-artifacts/epics.md` → Epic 1 → Story 1.4]
- Spend safety prerequisites (cap + consent): [Source: `_bmad-output/planning-artifacts/prd.md` → “Spend Safety / Consent”]
- UX patterns (calm copy, deterministic next steps): [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` → “Feedback Patterns”]
- Architecture + boundaries (routes vs services, Zod schemas, naming): [Source: `_bmad-output/planning-artifacts/architecture.md`]
- Existing patterns to follow:
  - Spend safety onboarding: [Source: `app/routes/app.onboarding.spend-safety.tsx`]
  - Dashboard checklist: [Source: `app/routes/app._index.tsx`]
  - Loader gating / readiness items: [Source: `app/routes/app.tsx`]
  - Readiness mapping: [Source: `app/lib/readiness.ts`]
  - Readiness signals: [Source: `app/services/shops/readiness.server.ts`]
  - Embedded query preservation: [Source: `app/lib/embedded-search.ts`]

## Dev Agent Record

### Agent Model Used

GPT-5.2 (Codex CLI)

### Debug Log References

### Completion Notes List

- Implemented storefront personalization onboarding route with explicit enable/disable choice and spend safety gating.
- Added server-authoritative finish-onboarding action that blocks until personalization is confirmed.
- Enforced dev tools danger gate server-side for destructive resets.
- Persisted storefront personalization settings and wired readiness/checklist updates.
- Tests: `npm test`.

### File List

- app/routes/app.onboarding.storefront-personalization.tsx
- app/routes/app.\_index.tsx
- app/routes/app.tsx
- app/routes/app.billing.tsx
- app/routes/app.dev.tsx
- app/routes/auth.session-token.tsx
- app/services/shops/storefront-personalization.server.ts
- app/services/shops/onboarding-reset.server.ts
- app/services/shops/readiness.server.ts
- app/lib/readiness.ts
- app/lib/readiness.test.ts
- app/schemas/admin.ts
- prisma/schema.prisma
- prisma/migrations/20260114120000_add_shop_storefront_personalization/migration.sql
- \_bmad-output/implementation-artifacts/sprint-status.yaml

### Change Log

- 2026-01-14: Added storefront personalization onboarding flow, persistence, and readiness wiring.
- 2026-01-14: Added finish-onboarding gating, dev danger enforcement, and readiness tests.
