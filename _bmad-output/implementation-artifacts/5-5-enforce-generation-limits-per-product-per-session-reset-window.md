# Story 5.5: Enforce Generation Limits (Per-Product, Per-Session, Reset Window)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a merchant,
I want the system to enforce generation limits by product and by session with a reset window,
so that costs are controlled and abuse is prevented.

## Acceptance Criteria

1. Given a shop has default generation limits configured, when the system evaluates limits, then the defaults are: per-product generation limit 5, per-session generation limit 15, reset window 30 minutes (rolling).
2. Given a buyer session is active, when a generation is requested, then the system checks both per-product and per-session remaining attempts, and if either limit is reached, the generation is blocked and the buyer receives clear messaging including tries remaining or reset timing.
3. Given the buyer is shown the regeneration action, then the UI displays tries left and the reset timer window clearly near the primary CTA.

## Tasks / Subtasks

- [ ] Define persistence for storefront generation attempts (AC: 1, 2)
  - [ ] Add a data model to record attempts keyed by shop_id, product_id, and buyer session id with created_at timestamps
  - [ ] Add Prisma migration with snake_case fields and indexes for shop_id + product_id + created_at
- [ ] Build limit evaluation service (AC: 1, 2)
  - [ ] Compute remaining per-product and per-session counts within a rolling 30-minute window
  - [ ] Return remaining counts plus reset_at timestamp for UI messaging
- [ ] Enforce limits in storefront generation routes (AC: 2)
  - [ ] Validate inputs via shared Zod schema (shop_id, product_id, personalization_session_id)
  - [ ] Block generation/regeneration when limits reached and return standard error envelope with remaining + reset_at
- [ ] Surface tries left + reset timer in the storefront stepper (AC: 3)
  - [ ] Show remaining counts on the generate/try-again CTA area
  - [ ] Disable CTA when limit reached with calm, deterministic copy
- [ ] Telemetry + logging (AC: 2, 3)
  - [ ] Emit PostHog events for limit checks and blocked attempts with correlation keys
  - [ ] Log limit decisions with pino and correlation ids
- [ ] Tests
  - [ ] Unit tests for rolling window calculations and remaining count math
  - [ ] Integration tests for limit enforcement returning correct error envelope

## Dev Notes

### Developer Context

- Epic 5 already enforces spend safety and billing idempotency; this story adds rate/abuse controls for buyer generations and must not bypass existing consent/cap guardrails. [Source: _bmad-output/planning-artifacts/epics.md#Story 5.5]
- Storefront UX must always show tries left and reset timing near the primary action in the result step (Add to cart primary, Try again secondary). [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX Consistency Patterns]

### Technical Requirements

- Defaults: per-product limit 5, per-session limit 15, rolling reset window 30 minutes. [Source: _bmad-output/planning-artifacts/epics.md#Story 5.5]
- Storefront requests must use App Proxy and `snake_case` payloads; any failure must return `{ error: { code, message, details? } }`. [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns]
- Use shared Zod schemas for all proxy inputs/outputs (storefront + server). [Source: _bmad-output/planning-artifacts/architecture.md#Shared Validation Schemas]
- Logs must be structured (pino JSON), and PostHog event props must use `snake_case` with correlation keys (`shop_id`, `product_id`, `personalization_session_id`). [Source: _bmad-output/planning-artifacts/architecture.md#Event System Patterns]

### Architecture Compliance

- Keep HTTP handling in `app/routes/*`, business logic in `app/services/*`, and never import routes from services. [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries]
- App Proxy signature verification is required on all storefront requests; dev-only bypass must be strictly gated. [Source: _bmad-output/planning-artifacts/architecture.md#Storefront / App Proxy Requests]

### Library / Framework Requirements

- Admin uses Polaris web components; storefront uses Tailwind + shadcn-style primitives with Zustand state. [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture]
- Inngest idempotency can be enforced via event `id` (producer) or function `idempotency` CEL expression (consumer); use where appropriate for limit-related workflows. [Source: https://www.inngest.com/docs/guides/handling-idempotency]

### File Structure Requirements

- App Proxy endpoints belong under `app/routes/app-proxy/*` (create if missing) and should call services in `app/services/*`. [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries]
- Storefront stepper logic lives in `extensions/personalize-design-app/assets/personalize-stepper.js` and related assets. [Source: _bmad-output/planning-artifacts/architecture.md#Requirements to Structure Mapping]
- New schemas go in `app/schemas/*` and must be reused by both proxy routes and storefront bundle build. [Source: _bmad-output/planning-artifacts/architecture.md#Shared Validation Schemas]

### Testing Requirements

- Co-locate unit tests next to services (e.g., `app/services/storefront/limits.server.test.ts`). [Source: _bmad-output/project-context.md#Testing Rules]
- Add integration tests only for high-risk boundaries like proxy signature verification and idempotent billing; keep limit enforcement tests focused. [Source: _bmad-output/project-context.md#Testing Rules]

### Previous Story Intelligence

- Story 5.4 introduced billable events + usage visibility; keep mill-precision billing guardrails intact when blocking generation. [Source: _bmad-output/implementation-artifacts/5-4-usage-visibility-auditable-billing-events.md]

### Git Intelligence Summary

- Recent commits added billing guardrails, usage ledger, and template generation flows; follow existing service boundaries and precision patterns. [Source: git log -5 --oneline]

### Latest Tech Information

- Inngest idempotency: event `id` prevents duplicate execution for 24 hours; function-level `idempotency` uses CEL expressions on event data for consumer-side dedupe. [Source: https://www.inngest.com/docs/guides/handling-idempotency]

### Project Structure Notes

- Keep new limit data tables `snake_case` and scoped by shop_id for multi-tenancy; add indexes that match rolling-window queries.
- If proxy routes do not exist yet, add them following the architecture path and ensure the dev-only bypass is disabled outside development.

### References

- Limit defaults and enforcement requirements. [Source: _bmad-output/planning-artifacts/epics.md#Story 5.5]
- Spend safety + consent guardrails for paid usage. [Source: _bmad-output/planning-artifacts/epics.md#Epic 5]
- UX messaging for tries left + reset window. [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX Consistency Patterns]
- Proxy/security/validation patterns. [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns]
- Project-wide agent rules. [Source: _bmad-output/project-context.md]
- Inngest idempotency guidance. [Source: https://www.inngest.com/docs/guides/handling-idempotency]

## Dev Agent Record

### Agent Model Used

GPT-4.1 (via opencode)

### Debug Log References

- git log -5 --oneline
- git show --name-only --oneline -1 258598e
- git show --name-only --oneline -1 3e6325b
- git show --name-only --oneline -1 703d997
- git show --name-only --oneline -1 de44223
- git show --name-only --oneline -1 2f5d429

### Completion Notes List

- Story created in YOLO mode from create-story workflow.
- Included limit enforcement guidance and storefront UX expectations.
- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

- \_bmad-output/implementation-artifacts/5-5-enforce-generation-limits-per-product-per-session-reset-window.md
