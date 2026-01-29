# Story 6.5: Regenerate Preview Within Limits (Cost + Tries Left + Reset Timer)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a buyer,
I want to regenerate the preview within allowed limits and see cost and reset messaging,
so that I can try again confidently without surprises.

## Acceptance Criteria

1. Given the buyer is on the result step and has remaining tries, when they click "Try again", then the system runs another generation using the same inputs/settings. [Source: _bmad-output/planning-artifacts/epics.md#Story 6.5: Regenerate Preview Within Limits (Cost + Tries Left + Reset Timer)]
2. Given the buyer is using regeneration, when the UI shows the action, then it displays tries left and the reset timer window clearly (30-minute rolling reset). [Source: _bmad-output/planning-artifacts/epics.md#Story 6.5: Regenerate Preview Within Limits (Cost + Tries Left + Reset Timer)]
3. Given the buyer reaches a limit (per-product or per-session), when they attempt to regenerate, then regeneration is blocked and the UI explains the limit and shows when it resets. [Source: _bmad-output/planning-artifacts/epics.md#Story 6.5: Regenerate Preview Within Limits (Cost + Tries Left + Reset Timer)]
4. Given regeneration is requested, when the system applies billing rules, then it consumes the same USD billing rules as generation and includes remove background cost if enabled. [Source: _bmad-output/planning-artifacts/epics.md#Story 6.5: Regenerate Preview Within Limits (Cost + Tries Left + Reset Timer)]
5. Given billing or spend policies prevent further generations, when the buyer tries again, then the UI shows clear messaging about the block and what will reset or must be configured. [Source: _bmad-output/planning-artifacts/prd.md#Storefront]

## Tasks / Subtasks

- [ ] Enforce regeneration limits in App Proxy flow (AC: 1, 3)
  - [ ] Reuse preview generation inputs and validate with shared Zod schema for regenerate requests.
  - [ ] Check per-product and per-session counters before creating a new preview job.
  - [ ] Block when limits reached and return error envelope with reset timing.
- [ ] Track tries remaining and reset window (AC: 2, 3)
  - [ ] Compute tries left from limit defaults and current counters.
  - [ ] Include reset window metadata in status/response payloads for the storefront.
- [ ] Cost and billing messaging for regeneration (AC: 4, 5)
  - [ ] Expose per-regeneration cost (generation + remove background when enabled) in the response payload.
  - [ ] Surface spend-policy blocks with deterministic messaging in the UI.
- [ ] Storefront UX updates for regeneration state (AC: 1, 2, 3, 5)
  - [ ] Show tries left and reset timer near the "Try again" action.
  - [ ] Show blocked state with clear recovery action when limits are reached.
  - [ ] Keep Add to cart available when regeneration is blocked.
- [ ] Telemetry and logging
  - [ ] Emit PostHog events for regeneration attempts and limit blocks with correlation keys.
  - [ ] Log limit blocks and regeneration outcomes without PII.

## Dev Notes

- Regeneration uses the same inputs/settings as the initial preview generation; prefer reusing preview job workflow rather than a new pipeline. [Source: _bmad-output/planning-artifacts/epics.md#Story 6.5: Regenerate Preview Within Limits (Cost + Tries Left + Reset Timer)]
- Default limits and reset window are defined as per-product 5, per-session 15, rolling reset 30 minutes. [Source: _bmad-output/planning-artifacts/epics.md#Story 5.5: Enforce Generation Limits (Per-Product, Per-Session, Reset Window)]
- Regeneration is billable like generation and must follow billing safety rules (bill only after image is generated and stored). [Source: _bmad-output/planning-artifacts/architecture.md#Billing Safety (Usage Charges) & Idempotency]
- Storefront messaging must always show tries remaining and reset window, and explain blocks due to limits or spend policies. [Source: _bmad-output/planning-artifacts/prd.md#Storefront]
- Use App Proxy only for storefront traffic in production and verify signatures on all proxy requests. [Source: _bmad-output/project-context.md#Framework-Specific Rules (Shopify + React Router)]

### Project Structure Notes

- Keep route handling in `app/routes/app-proxy/*` and business logic in `app/services/*`; do not import routes from services. [Source: _bmad-output/planning-artifacts/architecture.md#Architectural Boundaries]
- Use `snake_case` for API payloads and map to internal `camelCase` types at boundaries. [Source: _bmad-output/planning-artifacts/architecture.md#Data Exchange Formats]

### References

- \_bmad-output/planning-artifacts/epics.md#Story 6.5: Regenerate Preview Within Limits (Cost + Tries Left + Reset Timer)
- \_bmad-output/planning-artifacts/epics.md#Story 5.5: Enforce Generation Limits (Per-Product, Per-Session, Reset Window)
- \_bmad-output/planning-artifacts/prd.md#Storefront
- \_bmad-output/planning-artifacts/architecture.md#Billing Safety (Usage Charges) & Idempotency
- \_bmad-output/planning-artifacts/architecture.md#API & Communication Patterns
- \_bmad-output/planning-artifacts/architecture.md#Shared Validation Schemas
- \_bmad-output/project-context.md

### Developer Context

- Story 6.3 established buyer preview generation and polling; regeneration should reuse the same preview job flow and not introduce a parallel pipeline. [Source: _bmad-output/implementation-artifacts/6-3-generate-raw-design-display-loading-states.md]
- Story 6.4 added background mockup generation tied to preview jobs; regeneration should keep mockup status handling intact and avoid breaking the Preview modal experience. [Source: _bmad-output/implementation-artifacts/6-4-printify-mockups-via-preview-modal-non-blocking.md]

### Technical Requirements

- App Proxy requests and responses must use `snake_case` fields and shared Zod schemas; return `{ error: { code, message, details? } }` on failures. [Source: _bmad-output/planning-artifacts/architecture.md#Shared Validation Schemas]
- Regeneration must reuse the same input payload (photo key + optional text) and template settings already validated for the session; avoid client-provided overrides beyond the allowed inputs. [Source: _bmad-output/planning-artifacts/epics.md#Story 6.5: Regenerate Preview Within Limits (Cost + Tries Left + Reset Timer)]
- Limit checks must be server-enforced with DB-backed counters and a rolling reset window; update counters atomically to prevent race conditions. [Source: _bmad-output/planning-artifacts/epics.md#Story 5.5: Enforce Generation Limits (Per-Product, Per-Session, Reset Window)]
- Include tries remaining and reset timing in status/response payloads for UI messaging. [Source: _bmad-output/planning-artifacts/epics.md#Story 6.5: Regenerate Preview Within Limits (Cost + Tries Left + Reset Timer)]
- Billing events must only be confirmed after the generated image is stored; reuse stable idempotency keys for regeneration attempts. [Source: _bmad-output/planning-artifacts/architecture.md#Billing Safety (Usage Charges) & Idempotency]
- PostHog events must follow `domain.action` naming with `snake_case` properties and correlation keys (`shop_id`, `job_id`, `product_id`, `personalization_id` when available). [Source: _bmad-output/planning-artifacts/architecture.md#Event System Patterns (PostHog)]

### Architecture Compliance

- Keep storefront backend access via App Proxy routes under `app/routes/app-proxy/*` with signature verification on every request. [Source: _bmad-output/planning-artifacts/architecture.md#Storefront -> Backend Communication]
- Keep integration logic in `app/services/*` and orchestration in Inngest functions; routes call services only. [Source: _bmad-output/planning-artifacts/architecture.md#Architectural Boundaries]
- Use shared Zod schemas for all proxy payloads and job payloads. [Source: _bmad-output/planning-artifacts/architecture.md#Shared Validation Schemas]

### Library / Framework Requirements

- React Router v7 route handlers are the server surface; do not add parallel REST services. [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns]
- Storefront UI uses Tailwind + shadcn-style primitives with Zustand state management. [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture]
- Inngest orchestrates generation workflows and retries with idempotency keys. [Source: _bmad-output/planning-artifacts/architecture.md#Async Orchestration]

### File Structure Requirements

- `app/routes/app-proxy/generate-preview/route.tsx` (regenerate request handling and limits gate)
- `app/routes/app-proxy/generate-preview-status/route.tsx` (include tries remaining and reset timing)
- `app/schemas/app_proxy.ts` (extend schemas for regenerate/limits metadata)
- `app/services/buyer-previews/buyer-previews.server.ts` (limit evaluation and preview job creation)
- `app/services/previews/preview-jobs.server.ts` (persist counters/status metadata)
- `app/services/inngest/functions/buyer-preview-generation.server.ts` (regeneration job flow)
- `storefront/stepper/src/stepper-store.ts` (state for tries remaining and reset timer)
- `storefront/stepper/src/components/Shell.tsx` (render "Try again", messaging, blocked states)
- `extensions/personalize-design-app/assets/personalize-stepper.js` (if shared storefront bundle needs data wiring)

### Testing Requirements

- Unit test: limit evaluation and reset window calculation for per-product and per-session limits.
- Unit test: regeneration request blocked returns error envelope with reset timing.
- Manual QA: tries left decrement on each regeneration, blocked state messaging, reset after 30 minutes, Add to cart unaffected.

## Previous Story Intelligence

- Preview job polling and result step UI already exist; regenerate should reuse those flows and avoid new polling endpoints. [Source: _bmad-output/implementation-artifacts/6-3-generate-raw-design-display-loading-states.md]
- Mockup preview modal is non-blocking; regeneration should not regress modal focus trap or add-to-cart availability. [Source: _bmad-output/implementation-artifacts/6-4-printify-mockups-via-preview-modal-non-blocking.md]

## Git Intelligence Summary

- Recent commits touched preview services, App Proxy status routes, and storefront stepper UI; keep changes aligned with existing preview job conventions. [Source: git log -5 --name-only]

## Latest Tech Information

- Web research for latest library changes was attempted but no results were available in this environment; rely on repo versions and documented architecture for this story.

## Project Context Reference

- \_bmad-output/project-context.md

## Story Completion Status

- Status set to `ready-for-dev`.
- Completion note: "Ultimate context engine analysis completed - comprehensive developer guide created".

## Dev Agent Record

### Agent Model Used

openai/gpt-5.2-codex

### Debug Log References

- \_bmad-output/planning-artifacts/epics.md
- \_bmad-output/planning-artifacts/architecture.md
- \_bmad-output/planning-artifacts/prd.md
- \_bmad-output/implementation-artifacts/6-4-printify-mockups-via-preview-modal-non-blocking.md
- \_bmad-output/project-context.md
- git log -5 --name-only

### Completion Notes List

- Drafted story 6.5 context with limits, cost messaging, and regeneration UX requirements.
- Included billing safety, App Proxy constraints, and shared schema requirements.
- Web research unavailable; no external updates applied.

### File List

- \_bmad-output/implementation-artifacts/6-5-regenerate-flow-limits-cost-messaging.md
