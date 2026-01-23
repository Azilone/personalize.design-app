# Story 5.2: Spend Safety Setup (Monthly Cap + Paid Usage Consent)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a merchant,
I want to set a monthly cap and explicitly consent to paid usage,
so that there are no surprise charges and I stay in control of spend.

## Acceptance Criteria

1. Given the shop has not configured spend safety, when the merchant opens Billing/Spend Safety settings, then the app shows a cap input pre-filled with $10.00 USD, a disclosure that after the free $1 gift usage is billed via Shopify Usage Charges (USD), and a required consent control (checkbox + confirm CTA).
2. Given the merchant confirms spend safety, when they submit, then the system saves the monthly cap amount and paid usage consent timestamp (audit trail), and the shop becomes eligible for paid usage once the free gift is used.
3. Given the shop has $0 free gift balance remaining and no paid usage consent recorded, when a billable action is attempted (generate/regenerate/remove-bg), then the action is blocked and the UI clearly explains how to enable paid usage (link to Billing/Spend Safety settings).
4. Given the shop has some free gift balance remaining but it is insufficient to cover the full cost of a billable action, when the action is attempted, then it is blocked unless paid usage consent is recorded and the UI explains the free gift would be partially used and the remaining amount billed via Shopify.
5. Given the shop is on Standard and the 7-day trial is active, when a billable action is attempted, then the same gift/consent/cap rules apply (trial does not waive usage charges).

## Epic Context

- Epic 5 objective: protect merchants from surprise AI usage charges while keeping billing safe and auditable.
- Cross-story dependencies: usage ledger and gift balance from Story 5.1; cap enforcement and cap increase flow in Story 5.3; usage visibility and billable events in Story 5.4; generation limit enforcement in Story 5.5.

## Tasks / Subtasks

- [x] Add spend safety persistence for cap + consent (AC: 1, 2)
  - [x] Extend Prisma schema with monthly cap + consent timestamp fields (snake_case)
  - [x] Create migration and backfill defaults where needed
- [x] Build admin Billing/Spend Safety settings UI + validation (AC: 1, 2)
  - [x] Add loader/action with Zod validation and error envelope
  - [x] Render Polaris form with cap input, disclosure, consent checkbox, confirm CTA
- [x] Enforce consent + cap gating for billable actions (AC: 3, 4, 5)
  - [x] Update billing guard service to block paid usage when gift is insufficient and consent missing
  - [x] Surface gating errors to storefront/admin with clear copy + link
- [x] Add telemetry + logs for consent changes and blocked usage (AC: 2, 3, 4, 5)
  - [x] Emit PostHog events with correlation keys and snake_case props
- [x] Tests for spend safety validation + gating (AC: 1, 2, 3, 4, 5)
  - [x] Unit tests for cap validation, consent gating rules, idempotency

## Dev Notes

### Developer Context

- Consent gating must be enforced at the billable action boundary (generation/regenerate/remove-bg), not only in UI.
- Keep rules aligned with the usage ledger from Story 5.1; avoid duplicating gift balance logic.
- Use shared Zod schemas for billing settings input and output; do not create ad-hoc validation.
- All API responses must use the `{ error: { code, message, details? } }` envelope on failures.
- Avoid regressions in existing billing summary UI and ledger calculations; do not change gift grant behavior.
- Do not mark this story done until billing settings UI, consent persistence, and gating are verified end-to-end.

### Technical Requirements

- Default monthly cap: $10.00 USD.
- Consent audit trail: store timestamp when consent is granted; include shop_id in correlation.
- Blocking logic:
  - If free gift balance is 0 and consent is missing, block billable actions.
  - If gift balance is positive but less than required cost, block unless consent exists.
  - Trial status does not bypass consent or cap rules.
- Use `snake_case` payload fields at boundaries; map to `camelCase` internally.
- Performance: do not add extra network round-trips in storefront generation paths; reuse existing ledger queries where possible.
- Deployment constraints: logs must go to stdout; no dev bypass allowed in production.

### Architecture Compliance

- Keep HTTP handling in `app/routes/*` and integration/business logic in `app/services/*`.
- Use Prisma migrations only; keep Prisma schema fields in `snake_case`.
- App Proxy endpoints must verify signature and return the standard error envelope on failure.
- PostHog events use `domain.action` names and `snake_case` properties with correlation keys.
- Supabase Storage remains private; do not expose service role keys to the client.

### Library / Framework Requirements

- Shopify Admin API usage is GraphQL-only.
- Use Polaris web components for admin UI.
- Use Prisma + Supabase Postgres for persistence.
- Versions: React Router ^7.12.0, @shopify/shopify-app-react-router ^1.1.0, React ^18.3.1, Prisma ^6.16.3. [Source: _bmad-output/project-context.md]

### File Structure Requirements

- Schema changes in `prisma/schema.prisma` with migration in `prisma/migrations/*`.
- Billing settings route under `app/routes/app/billing/route.tsx` (extend existing screen if present).
- Billing rules in `app/services/shopify/billing.server.ts` and related helpers; no route imports.
- Shared schemas in `app/schemas/billing.ts` or existing billing schema module.
- Guardrails for deployment and env checks live with billing services, not routes.

### Testing Requirements

- Unit tests colocated with billing service helpers (`*.test.ts`).
- Add integration tests only if new boundary validation is introduced (e.g., admin action payloads).
- Add regression checks for gift balance and consent gating in billing service tests.

### Previous Story Intelligence

- Story 5.1 introduced usage ledger + gift balance tracking; reuse that service for gift balance checks.
- Existing pricing constants live in `app/lib/usage-pricing.ts`; do not duplicate pricing values.
- Prior tests added in `app/services/shopify/billing.server.test.ts` and `app/services/supabase/storage.test.ts` provide patterns for new tests.
- Review fixes in Story 5.1 emphasized ledger-based gift balance and idempotency coverage; do not revert those changes.

### Git Intelligence Summary

- Recent work added merchant preview workflows, PostHog updates, and usage ledger changes; expect patterns for billing services and storage utilities in `app/services/*`.
- Latest commits show migrations and tests colocated with services; follow those conventions.
- `package.json` and `pnpm-lock.yaml` changed recently; be careful when adding dependencies and keep versions aligned.

### Latest Tech Information

- Shopify `appUsageRecordCreate` supports an optional `idempotencyKey` (max 255 chars) and returns errors when the capped amount is exceeded or duplicate keys are in progress. This should be used for usage charges once consent/cap gating passes. [Source: https://shopify.dev/docs/api/admin-graphql/latest/mutations/appUsageRecordCreate]
- Best practice: treat capped amount errors as a hard stop and surface a clear merchant action to increase cap. [Source: https://shopify.dev/docs/api/admin-graphql/latest/mutations/appUsageRecordCreate]

### Project Structure Notes

- Align spend safety changes with existing billing and plan services, keeping `snake_case` at boundaries.
- Preserve the admin Billing/Usage screen structure and Polaris patterns already in use.
- Out of scope: monthly cap increase flow (Story 5.3) and usage history UI (Story 5.4).

### References

- Story 5.2 acceptance criteria. [Source: _bmad-output/planning-artifacts/epics.md#Story 5.2]
- Spend safety defaults and consent rules. [Source: _bmad-output/planning-artifacts/prd.md#Subscription Tiers & Billing]
- Billing safety and idempotency rules. [Source: _bmad-output/planning-artifacts/architecture.md#Billing Safety (Usage Charges) & Idempotency]
- Admin UX patterns and disclosure tone. [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Button Hierarchy]
- Project-wide agent rules. [Source: _bmad-output/project-context.md]

## Dev Agent Record

### Agent Model Used

OpenCode (OpenAI)

### Debug Log References

- Workflow: create-story (YOLO mode)

### Completion Notes List

- Generated story context with spend safety defaults, consent gating, and testing guidance.
- Implemented billing guardrails module (`billing-guardrails.server.ts`) with `checkBillableActionAllowed` function.
- Added PostHog telemetry for blocked usage (`billing.usage_blocked` event).
- Integrated guardrails into Inngest functions (`templateTestGenerate`, `templateTestRemoveBackground`).
- Added 7 unit tests covering all gating scenarios.

### File List

- app/services/shopify/billing-guardrails.server.ts
- app/services/shopify/billing-guardrails.server.test.ts
- app/services/posthog/events.ts
- app/services/inngest/functions/template-test-generate.server.ts
- app/routes/app/billing/route.tsx
- app/services/shops/spend-safety.server.ts
- prisma/schema.prisma
- \_bmad-output/implementation-artifacts/sprint-status.yaml

### Change Log

- Added consent gating enforcement for billable actions (AC 3, 4, 5). (2026-01-23)
- Fixed billing guardrails to enforce monthly cap (AC 5.3) and improved UI quality in billing settings. (2026-01-23)
