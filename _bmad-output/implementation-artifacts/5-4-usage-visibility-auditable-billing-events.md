# Story 5.4: Usage Visibility + Auditable Billing Events

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a merchant,
I want to see my usage, spend, and billable events history,
so that I can audit charges and understand costs.

## Acceptance Criteria

1. Given the merchant opens the usage & billing screen, when the page loads, then it shows month-to-date spend, current cap, and remaining capacity.
2. Given the merchant opens the usage & billing screen, when the page loads, then it shows a list of billable events with timestamps and USD amounts.
3. Given billable events are listed, then each includes event type (generation/regeneration/remove-bg/order_fee), status (succeeded/failed/waived), and an idempotency key so retries cannot double-charge.
4. Given order fee events are shown, then they are clearly labeled as “$0.25 per successful personalized order line” (Standard only).
5. Given a billable action succeeds (provider cost incurred), when the system records billing, then exactly one billable event is created, and billing is finalized only once the result is persisted and retrievable.
6. Given a billable action succeeds, when billing finalizes, then exactly one Shopify Usage Charge is created for the billable USD amount after applying any remaining free gift balance (may be $0).
7. Given a billable action fails and no provider cost is incurred, when the system records the outcome, then the billable event is recorded as failed/voided and the merchant is not charged.
8. Given a billable action fails after provider cost was incurred but the result was not persisted, when the system records the outcome, then the billable event is recorded as failed/waived and the merchant is not charged.

## Tasks / Subtasks

- [x] Extend usage summary data for billing screen (AC: 1)
  - [x] Add/confirm service method to return month-to-date spend, cap, remaining capacity (use mill precision fields)
  - [x] Ensure summary aligns with gift + paid spend totals and uses UTC month boundaries
- [x] Build billable events list query (AC: 2, 3, 4)
  - [x] Add service method to fetch recent `billable_events` for shop (limit + order desc by created_at)
  - [x] Map event types and statuses to human-readable labels
  - [x] Include idempotency_key in the view for auditability (not editable)
- [x] Update billing/usage screen UI (AC: 1, 2, 3, 4)
  - [x] Add a “Billable events” section with table/list rows
  - [x] Surface event type, status, amount, created_at, idempotency_key
  - [x] Label order_fee row as “$0.25 per successful personalized order line” (Standard only)
- [x] Enforce billable event creation and charge timing rules (AC: 5, 6, 7, 8)
  - [x] Ensure event is created before provider call with stable idempotency key
  - [x] Only mark event chargeable/confirmed after asset persisted
  - [x] Create Shopify usage charge only after confirmation and gift coverage applied
  - [x] Mark failed/waived status based on provider cost and persistence outcome
- [x] Telemetry and logs (AC: 5, 6, 7, 8)
  - [x] Emit PostHog events for billing state transitions (created/confirmed/charge_succeeded/charge_failed/waived)
  - [x] Log billing decisions with correlation keys (shop_id, billable_event_id, idempotency_key)
- [x] Tests
  - [x] Unit tests for usage summary calculations (month boundaries + mills)
  - [x] Unit tests for billable events query mapping
  - [x] Integration tests for idempotency (event + usage charge created exactly once)

## Dev Notes

### Developer Context

- Story 5.1 introduced the `billable_events` ledger and usage gift tracking; Story 5.2 added consent gating and guardrails; Story 5.3 added monthly cap enforcement with mill precision values. This story must reuse those services and not reintroduce dollar rounding issues.
- Usage visibility is admin-only (embedded app); do not build a storefront UI here.
- All billable events must be auditable and idempotent; usage charges occur only after assets are generated and persisted.

### Technical Requirements

- **Usage summary:** show month-to-date paid spend, current cap, remaining capacity. Use mill-precision fields where available; format to USD in UI.
- **Billable events list:** include event_type, status, amount (USD from mills), created_at, idempotency_key.
- **Event types:** `generation`, `regeneration`, `remove_bg`, `order_fee`.
- **Statuses:** `succeeded`, `failed`, `waived` (display in UI; map internal states as needed).
- **Charge timing:** create `billable_events` before provider call; only mark confirmed/chargeable after asset persisted and retrievable.
- **Gift application:** apply remaining free gift balance before issuing Shopify usage charge; if fully covered, usage charge is $0 but event still exists for audit.
- **Failure handling:** if provider cost not incurred, mark failed/voided and do not charge; if cost incurred but asset not persisted, mark failed/waived and do not charge.

### Architecture Compliance

- Keep HTTP handling in `app/routes/*`; business logic in `app/services/*`.
- Use shared Zod schemas for request/response validation at boundaries.
- Maintain `snake_case` payloads and standard error envelope on API failures.
- Emit PostHog events with `domain.action` names and `snake_case` props including correlation keys.

### Library / Framework Requirements

- Admin UI uses Polaris web components; do not add a new UI system.
- Shopify Admin API usage is GraphQL-only.
- Versions: React Router ^7.12.0, @shopify/shopify-app-react-router ^1.1.0, React ^18.3.1, Prisma ^6.16.3. [Source: _bmad-output/project-context.md]

### File Structure Requirements

- Billing/usage screen: `app/routes/app/billing/route.tsx` (extend existing UI).
- Billing guardrails: `app/services/shopify/billing-guardrails.server.ts` (ensure event creation/confirmation hooks are reused).
- Usage ledger summary + events: `app/services/shopify/billing.server.ts` and/or `app/services/shops/spend-safety.server.ts` (reuse existing patterns).
- PostHog events: `app/services/posthog/events.ts`.
- Tests: co-locate `*.test.ts` with services.

### Testing Requirements

- Unit tests for month boundaries (UTC) and mill-to-USD formatting.
- Unit tests for billable events query mapping and status labeling.
- Integration tests for idempotency: repeat calls should not create duplicate events or charges.
- Regression tests: ensure existing consent + cap guardrails still block correctly.

### Previous Story Intelligence

- Story 5.3 added mill-precision tracking (`amount_mills`) and cap enforcement; do not revert to floating USD math. [Source: _bmad-output/implementation-artifacts/5-3-monthly-cap-enforcement-explicit-cap-increase-flow.md]
- Billing guardrails already return structured errors and include cap metadata; keep this consistent in UI messaging.

### Git Intelligence Summary

- Recent commits show billing guardrails and spend safety updates; follow existing service boundaries and mills precision patterns. [Source: git log]

### Latest Tech Information

- Shopify `appUsageRecordCreate` accepts an `idempotencyKey` and returns an error if usage exceeds the subscription capped amount; keep local cap enforcement as primary guard and treat Shopify errors as secondary guardrails. [Source: https://shopify.dev/docs/api/admin-graphql/latest/objects/AppUsageRecord]

### Project Structure Notes

- Align new UI sections with existing Billing screen structure and Polaris patterns.
- Keep usage/billing calculations in service layer; UI consumes formatted data only.
- Avoid adding new routes; extend current billing route and services.

### References

- Usage visibility acceptance criteria. [Source: _bmad-output/planning-artifacts/epics.md#Story 5.4]
- Billing safety and idempotency rules. [Source: _bmad-output/planning-artifacts/architecture.md#Billing Safety (Usage Charges) & Idempotency]
- Naming, error envelope, PostHog requirements. [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules]
- Spend safety and usage billing rules. [Source: _bmad-output/planning-artifacts/prd.md#Subscription Tiers & Billing]
- UX/admin patterns (Polaris). [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Design System Foundation]
- Project-wide agent rules. [Source: _bmad-output/project-context.md]

## Dev Agent Record

### Agent Model Used

GPT-4.1 (via opencode)

### Debug Log References

- git log -5 --oneline

### Completion Notes List

- Story created in YOLO mode from create-story workflow.
- Added Shopify usage charge creation with idempotency and offline admin lookup.
- Wired fake test generation to billable events flow and updated usage summary display.
- Expanded billing tests to cover Shopify usage record creation path.
- Added merchant preview failure handler to mark billable events failed/waived.

### File List

- \_bmad-output/implementation-artifacts/5-4-usage-visibility-auditable-billing-events.md
- app/routes/app/billing/route.tsx
- app/routes/app/onboarding/spend-safety/route.tsx
- app/routes/app/readiness/route.tsx
- app/services/inngest/functions/template-test-generate.server.ts
- app/services/shops/readiness.server.ts
- app/services/posthog/events.ts
- app/services/shopify/billable-events.server.ts
- app/services/shopify/billable-events.server.test.ts
- app/services/shopify/billing.server.ts
- app/services/shopify/billing.server.test.ts
- app/services/inngest/functions/merchant-preview-generation.server.ts
- app/schemas/billing.ts
- app/lib/billable-events.ts
- prisma/schema.prisma
- prisma/migrations/20260124124915_add_billable_events_table/migration.sql
