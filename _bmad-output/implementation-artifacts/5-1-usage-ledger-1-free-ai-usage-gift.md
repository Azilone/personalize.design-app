# Story 5.1: Usage Ledger + $1 Free AI Usage Gift

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a merchant,
I want to receive a free usage gift and see my balance and pricing clearly,
so that I can test the product and understand future costs.

## Acceptance Criteria

1. Given a shop activates Early Access or subscribes to Standard, when billing/usage tracking is provisioned, then the system grants a one-time $1.00 USD free AI usage gift and records the grant in an auditable ledger.
2. Given the merchant views the billing/usage screen, when the system shows their balance, then it displays remaining free gift balance, paid usage spend month-to-date, current prices for billable actions, and notes that the gift applies first and Printify mockups are not billed.
3. Given the shop is on Standard, when the billing/usage screen renders, then it shows trial status (e.g. 7-day free trial active) and clarifies the trial does not waive usage charges or per-order fees.

## Tasks / Subtasks

- [ ] Define usage ledger model and gift balance tracking (AC: 1)
  - [ ] Add Prisma schema for gift grant + ledger entries using snake_case fields
  - [ ] Add migration with composite indexes for shop_id + event ordering
- [ ] Provision gift grant on plan activation (AC: 1)
  - [ ] Add service method to record the $1.00 gift with idempotency key
  - [ ] Emit PostHog event for gift grant with shop_id correlation
- [ ] Build billing/usage UI summary (AC: 2, 3)
  - [ ] Add loader/service query to compute gift balance + paid usage MTD
  - [ ] Render pricing and gift notes in admin UI with Polaris components
- [ ] Document pricing constants and usage ledger behavior (AC: 2)
  - [ ] Add shared constants for USD prices and labels used in UI

## Dev Notes

### Developer Context

- Gift grant and usage ledger must be auditable and idempotent; do not create duplicate gifts on retries.
- Keep billing logic in services and expose via admin route loader/action only; no separate REST layer.
- Use shared Zod schemas for any admin inputs or settings returned to the client.
- PostHog event props must be snake_case and include correlation keys (shop_id, billable_event_id if applicable).

### Technical Requirements

- Gift amount: $1.00 USD, one-time per shop on plan activation.
- Ledger records must store amounts in USD and be queryable for remaining gift balance and paid spend month-to-date.
- UI must state pricing for generate/regenerate/remove-bg and note Printify mockups are not billed.
- Standard plan trial status must be displayed and must explicitly state that the trial does not waive usage charges or per-order fees.
- Do not expose secrets or service role keys in UI or client bundles.

### Architecture Compliance

- Keep HTTP handling in `app/routes/*` and integration logic in `app/services/*`.
- Use Prisma migrations only; keep Prisma schema fields in snake_case.
- Validate admin-facing responses with shared Zod schemas in `app/schemas/*`.
- Log structured events via pino and PostHog; avoid PII and secrets.

### Library / Framework Requirements

- Shopify Admin API usage must be GraphQL-only; usage charges (later stories) use `appUsageRecordCreate` with idempotencyKey and capped amount handling.
- Use Polaris web components for admin UI.
- Use Prisma for data access and Supabase Postgres for storage.

### File Structure Requirements

- Prisma schema updates in `prisma/schema.prisma` with migration in `prisma/migrations/*`.
- Admin billing/usage route under `app/routes/` (e.g., `app/routes/app.billing.tsx`).
- Billing/ledger logic in `app/services/shopify/billing.ts` and `app/services/posthog/events.ts` (no route imports).
- Shared pricing/constants and Zod schemas under `app/schemas/` or `app/lib/` as aligned with existing patterns.

### Testing Requirements

- Add unit tests for gift balance calculation and idempotency key generation (`*.test.ts` next to module).
- Add small integration tests only if new boundary validation is introduced (e.g., admin form payloads).

### Latest Tech Information

- Shopify Admin GraphQL `appUsageRecordCreate` accepts `description`, `price`, `subscriptionLineItemId`, and optional `idempotencyKey` (max 255 chars); exceeding capped amount returns an error. Use this in later billing steps to avoid duplicate charges. [Source: https://shopify.dev/docs/api/admin-graphql/latest/mutations/appUsageRecordCreate]

### Project Structure Notes

- Align new ledger/billing code with existing service boundaries and naming conventions (snake_case payloads at boundaries, camelCase internally).
- Keep admin UI changes within existing Polaris patterns; avoid new UI frameworks.

### References

- Epic 5 story details and acceptance criteria. [Source: _bmad-output/planning-artifacts/epics.md#Story 5.1]
- Billing and spend safety requirements. [Source: _bmad-output/planning-artifacts/prd.md#Subscription Tiers & Billing]
- Architecture constraints for billing, idempotency, logging, and storage security. [Source: _bmad-output/planning-artifacts/architecture.md#Billing Safety (Usage Charges) & Idempotency]
- UI patterns and tone for admin billing screens. [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Button Hierarchy]
- Shopify usage record mutation. [Source: https://shopify.dev/docs/api/admin-graphql/latest/mutations/appUsageRecordCreate]
- Project-wide agent rules. [Source: _bmad-output/project-context.md]

## Dev Agent Record

### Agent Model Used

OpenCode (OpenAI)

### Debug Log References

- Workflow: create-story (YOLO mode)

### Completion Notes List

- Story marked ready-for-dev with comprehensive context and guardrails.

### File List

- \_bmad-output/implementation-artifacts/5-1-usage-ledger-1-free-ai-usage-gift.md
