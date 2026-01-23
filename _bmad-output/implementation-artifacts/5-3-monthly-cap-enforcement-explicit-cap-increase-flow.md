# Story 5.3: Monthly Cap Enforcement + Explicit Cap Increase Flow

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a merchant,
I want a monthly spending cap that hard-stops charges and requires explicit increases,
so that I stay in control of my maximum spend.

## Acceptance Criteria

1. Given the shop has a monthly cap configured (default $10.00 USD), when paid usage occurs, then the system tracks month-to-date spend against the cap.
2. Given the shop reaches the cap, when the merchant attempts any further paid action, then the action is blocked and the UI explains the cap was reached and shows the reset date (start of next calendar month, UTC).
3. Given the cap is reached, when the merchant wants to continue, then they must go to spend safety settings and explicitly increase the cap (with confirmation) before paid actions are allowed again.

## Epic Context

- Epic 5 objective: protect merchants from surprise AI usage charges while keeping billing safe and auditable.
- Cross-story dependencies:
  - Story 5.1 established the usage ledger and gift balance tracking.
  - Story 5.2 established monthly cap storage, consent persistence, and initial guardrails.
  - Story 5.3 extends guardrails to hard-enforce cap and adds explicit cap increase flow.
  - Story 5.4 will add detailed usage visibility and billing event history.
  - Story 5.5 will add generation limits (per-product, per-session).

## Tasks / Subtasks

- [x] Extend billing guardrails to enforce monthly cap (AC: 1, 2)
  - [x] Add MTD paid spend calculation to `checkBillableActionAllowed` function
  - [x] Compare MTD spend + proposed action cost against monthly cap
  - [x] Block action if cap would be exceeded (proactive block, not just reactive)
  - [x] Return structured error with cap_exceeded code, reset_date, and MTD spend

- [ ] Surface cap-exceeded errors to storefront and admin (AC: 2)
  - [x] Update billing guardrails error response to include cap_reached_at, reset_date, mtd_spend_usd, cap_usd
  - [ ] Update storefront generation flow to display cap-exceeded messaging with reset date
  - [x] Update admin template test-generate UI to display cap-exceeded messaging

- [x] Build cap increase flow in admin billing settings (AC: 3)
  - [x] Add UI element showing current cap, MTD spend, and remaining capacity
  - [x] Add "Increase Cap" CTA that opens inline form or modal
  - [x] Require explicit confirmation (checkbox + confirm button) for cap increase
  - [x] Validate new cap is greater than current MTD spend (cannot decrease below current usage)
  - [x] Save new cap and emit PostHog event for cap change

- [x] Add telemetry + logs for cap enforcement (AC: 1, 2, 3)
  - [x] Emit `billing.cap_exceeded` event when cap blocks an action (include shop_id, mtd_spend_usd, cap_usd, action_type)
  - [x] Emit `billing.cap_increased` event when merchant increases cap (include shop_id, old_cap_usd, new_cap_usd)
  - [x] Add structured pino logs for cap enforcement decisions

- [x] Tests for cap enforcement and increase flow (AC: 1, 2, 3)
  - [x] Unit tests for MTD spend calculation against cap
  - [x] Unit tests for proactive blocking (action cost + MTD > cap)
  - [x] Unit tests for cap increase validation (new cap > current spend)
  - [x] Add regression tests to ensure existing gift/consent gating is not broken

## Dev Notes

### Developer Context

- Story 5.2 already implemented the billing guardrails module (`billing-guardrails.server.ts`) with `checkBillableActionAllowed` function. Extend this function to include cap enforcement logic.
- Cap enforcement must be **proactive**: block the action if (MTD spend + action cost) > cap, not just when MTD > cap (prevent mid-action cap breach).
- Reset date is always the first of the next calendar month in UTC. Use a deterministic calculation.
- The cap increase flow must require explicit confirmation - do not allow accidental increases via simple text field edits.
- Keep alignment with existing billing summary UI in `app/routes/app/billing/route.tsx`.

### Technical Requirements

- **MTD spend calculation:** Query the usage ledger for paid charges in the current calendar month (UTC boundaries).
- **Cap enforcement formula:** Block if `mtd_spend_usd + proposed_action_cost_usd > monthly_cap_usd`.
- **Reset date:** First day of next month, 00:00:00 UTC (e.g., if today is 2026-01-23, reset is 2026-02-01T00:00:00Z).
- **Cap increase validation:**
  - New cap must be > current MTD spend (cannot decrease to a value that would immediately block).
  - New cap must be > 0 (cannot set to zero or negative).
- **Error response structure:**
  ```typescript
  {
    error: {
      code: 'CAP_EXCEEDED',
      message: 'Monthly spending cap reached. Increase your cap to continue.',
      details: {
        cap_usd: 10.00,
        mtd_spend_usd: 10.05,
        reset_date: '2026-02-01T00:00:00Z',
        action_cost_usd: 0.05
      }
    }
  }
  ```
- **UI requirements:**
  - Display cap-exceeded message with reset date in human-readable format.
  - Display remaining cap capacity in billing settings (e.g., "$2.50 of $10.00 remaining").
  - Cap increase form must include confirmation checkbox and CTA.

### Architecture Compliance

- Keep HTTP handling in `app/routes/*` and integration/business logic in `app/services/*`.
- Use Prisma migrations if schema changes are needed (not expected for this story - cap is already stored).
- App Proxy endpoints must return the standard error envelope on failure.
- PostHog events use `domain.action` names and `snake_case` properties with correlation keys.
- Do not duplicate pricing constants; reuse from `app/lib/usage-pricing.ts`.

### Library / Framework Requirements

- Shopify Admin API usage is GraphQL-only (no changes expected for this story).
- Use Polaris web components for admin UI (TextField, Button, Banner, Modal or inline confirmation).
- Versions: React Router ^7.12.0, @shopify/shopify-app-react-router ^1.1.0, React ^18.3.1, Prisma ^6.16.3. [Source: _bmad-output/project-context.md]

### File Structure Requirements

- Billing guardrails in `app/services/shopify/billing-guardrails.server.ts` (extend existing).
- Billing settings route in `app/routes/app/billing/route.tsx` (extend existing).
- Spend safety service in `app/services/shops/spend-safety.server.ts` (extend existing if needed).
- PostHog events in `app/services/posthog/events.ts` (add new event types).
- Tests colocated with modules (`*.test.ts`).

### Testing Requirements

- Unit tests colocated with billing guardrails service (`billing-guardrails.server.test.ts`).
- Test scenarios:
  - MTD spend is 0, cap is $10, action cost is $0.05 -> allowed
  - MTD spend is $9.96, cap is $10, action cost is $0.05 -> blocked (would exceed)
  - MTD spend is $10, cap is $10, action cost is $0.05 -> blocked
  - MTD spend is $8, cap is $10, new cap is $5 -> rejected (below current spend)
  - MTD spend is $8, cap is $10, new cap is $15 -> allowed
- Regression: ensure gift balance gating and consent gating from Story 5.2 still work.

### Previous Story Intelligence

- **Story 5.1:** Introduced usage ledger (`billable_events` table), gift balance tracking, pricing constants in `app/lib/usage-pricing.ts`. The `getUsageLedgerSummary` or similar function should provide MTD spend data.
- **Story 5.2:** Implemented billing guardrails (`checkBillableActionAllowed`), consent gating, cap storage in shop record. Added PostHog events for blocked usage. Tests in `billing-guardrails.server.test.ts`.
- **Files created/modified in 5.2:**
  - `app/services/shopify/billing-guardrails.server.ts`
  - `app/services/shopify/billing-guardrails.server.test.ts`
  - `app/services/posthog/events.ts`
  - `app/routes/app/billing/route.tsx`
  - `app/services/shops/spend-safety.server.ts`
- **Key patterns:**
  - Use `checkBillableActionAllowed` as the single entry point for billing guard checks.
  - PostHog events include `shop_id` and relevant correlation keys.
  - Error responses use the standard envelope with `code`, `message`, `details`.

### Git Intelligence Summary

- Recent commits show work on merchant preview, billing/usage ledger, and product assignment.
- Commit `d913712` ("5-1") and `1d2ae43` ("Fix issues from code review") are related to billing stories.
- Follow existing patterns for service organization and Inngest integration.

### Latest Tech Information

- Shopify `appUsageRecordCreate` returns an error when the capped amount is exceeded. This story enforces the cap **before** calling Shopify, so the Shopify capped amount should rarely be hit (it acts as a second safety net).
- Best practice: treat capped amount errors from Shopify as a hard stop and surface a clear merchant action to increase cap. [Source: https://shopify.dev/docs/api/admin-graphql/latest/mutations/appUsageRecordCreate]

### Project Structure Notes

- Align cap enforcement with existing billing guardrails and spend safety services.
- Preserve the admin Billing/Usage screen structure and Polaris patterns already in use.
- Out of scope: detailed usage event history UI (Story 5.4) and generation limits (Story 5.5).

### References

- Story 5.3 acceptance criteria. [Source: _bmad-output/planning-artifacts/epics.md#Story 5.3]
- Billing safety and idempotency rules. [Source: _bmad-output/planning-artifacts/architecture.md#Billing Safety (Usage Charges) & Idempotency]
- Spend safety defaults and consent rules. [Source: _bmad-output/planning-artifacts/prd.md#Subscription Tiers & Billing]
- Previous story 5.2 implementation. [Source: _bmad-output/implementation-artifacts/5-2-spend-safety-setup-monthly-cap-paid-usage-consent.md]
- Previous story 5.1 implementation. [Source: _bmad-output/implementation-artifacts/5-1-usage-ledger-1-free-ai-usage-gift.md]
- Project-wide agent rules. [Source: _bmad-output/project-context.md]

## Dev Agent Record

### Agent Model Used

GPT-4.1 (via opencode)

### Debug Log References

### Completion Notes List

- Added mills-based (sub-cent) usage tracking to avoid rounding $0.025 to $0.03
- Extended `checkBillableActionAllowed` to return `cap_reached_at` and use mill precision
- Updated billing settings to allow lowering cap as long as it remains above MTD spend
- Updated usage summary displays to use mill precision formatting
- Added usage ledger migration for mill precision
- Updated billing guardrails and usage charge tests for mill precision
- Storefront cap-exceeded messaging is still pending (storefront flow not yet implemented)

### File List

**Modified:**

- `app/lib/usage-pricing.ts` - Added mill precision gift constant
- `app/routes/app/_index/route.tsx` - Use mill precision values for gift display
- `app/routes/app/billing/route.tsx` - Use mill precision usage display; allow safe cap decreases
- `app/routes/app/route.tsx` - Pass mill precision usage totals
- `app/routes/app/templates/$templateId/route.tsx` - Use mill precision guardrail checks
- `app/schemas/billing.ts` - Track mill precision usage values
- `app/services/inngest/functions/merchant-preview-generation.server.ts` - Use mill precision guardrail checks
- `app/services/inngest/functions/template-test-generate.server.ts` - Use mill precision guardrail checks
- `app/services/posthog/events.ts` - Add mill precision billing event props
- `app/services/shopify/billing-guardrails.server.ts` - Add mill precision enforcement + cap_reached_at
- `app/services/shopify/billing-guardrails.server.test.ts` - Update tests for mill precision
- `app/services/shopify/billing-guardrails.ts` - Add mill precision helpers
- `app/services/shopify/billing.server.test.ts` - Update usage ledger tests for mills
- `app/services/shopify/billing.server.ts` - Store and summarize usage in mills
- `prisma/schema.prisma` - Add amount_mills to usage ledger entries

**Added:**

- `prisma/migrations/20260123120000_add_usage_ledger_mills/migration.sql` - Backfill usage ledger mills

**Tests:**

- Updated tests in `billing-guardrails.server.test.ts` and `billing.server.test.ts`
