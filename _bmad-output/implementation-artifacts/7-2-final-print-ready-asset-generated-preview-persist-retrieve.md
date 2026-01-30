# Story 7.2: Final Print-Ready Asset = Generated Preview (Persist + Retrieve)

Status: ready-for-dev

**Completion Note:** Ultimate context engine analysis completed - comprehensive developer guide created

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an operator,
I want the system to treat the buyer’s generated image as the final print-ready asset and persist it per order line,
so that fulfillment can run without re-generating.

## Acceptance Criteria

**Given** an order line has `personalization_id`
**When** fulfillment processing starts
**Then** the system resolves `personalization_id` to the stored generated image
**And** it persists/associates that image as the final print-ready asset for the order line (secure storage + stable reference)

**Given** the final asset is associated to the order line
**When** the operator or merchant needs to retrieve it
**Then** the system provides secure access to the print-ready asset (time-limited URL) without exposing public buckets

**Given** the referenced generated image is missing or inaccessible
**When** fulfillment processing runs
**Then** the order line is marked as failed with a clear reason and recovery guidance

## Tasks / Subtasks

- [ ] Confirm data model for print-ready asset association (AC: 1, 2)
  - [ ] Decide where to store final asset reference (extend `order_line_processing` vs dedicated table)
  - [ ] Ensure fields are `snake_case` and scoped by `shop_id`
- [ ] Resolve `personalization_id` to generated preview asset (AC: 1)
  - [ ] Implement lookup for preview job/output by `personalization_id`
  - [ ] Validate asset exists and is accessible in private storage
- [ ] Persist final print-ready asset mapping (AC: 1)
  - [ ] Store stable reference (bucket/path + checksum/metadata)
  - [ ] Record linkage to `order_line_id` and `personalization_id`
  - [ ] Emit PostHog event for `fulfillment.asset.persisted`
- [ ] Provide secure retrieval for operators/merchants (AC: 2)
  - [ ] Implement signed URL generation via Supabase Storage
  - [ ] Ensure URLs are time-limited and scoped
  - [ ] Add retrieval service method (no public buckets)
- [ ] Handle missing/inaccessible asset (AC: 3)
  - [ ] Mark order line processing as failed with reason code
  - [ ] Emit PostHog error event with correlation keys
  - [ ] Provide recovery guidance text for ops UI/logs
- [ ] Add or update Zod schemas for any new payloads (AC: 1, 2, 3)
- [ ] Add unit tests for asset resolution and signed URL generation (AC: 1, 2, 3)

## Dev Notes

### Critical Architecture Requirements

- **No regeneration:** Use the stored generated preview as the final print-ready asset. Do not trigger fal.ai or re-render during fulfillment. [Source: _bmad-output/planning-artifacts/epics.md#story-7.2]
- **Secure storage only:** Supabase Storage buckets are private; access must be via signed URLs only. Never expose service role keys to storefront code. [Source: _bmad-output/planning-artifacts/architecture.md#asset-security] [Source: AGENTS.md]
- **Idempotency:** Fulfillment steps must be safe to retry; use a stable idempotency key for the asset association step (e.g., `{shop_id}:{order_line_id}:final_asset`). [Source: _bmad-output/planning-artifacts/architecture.md#idempotency--retries]
- **Error envelope:** All failures from proxy/web endpoints must return `{ error: { code, message, details? } }`. [Source: AGENTS.md]
- **Telemetry:** PostHog events must be `domain.action` with `snake_case` properties and correlation keys (`shop_id`, `order_line_id`, `job_id`). [Source: _bmad-output/planning-artifacts/architecture.md#event-system-patterns]

### Project Structure Notes

- Use existing boundaries: routes in `app/routes/*`, integrations in `app/services/*`, workflows in `app/inngest/functions/*`, and schemas in `app/schemas/*`. [Source: _bmad-output/planning-artifacts/architecture.md#project-organization]
- Likely touch points:
  - `app/inngest/functions/fulfillment.ts` for the asset persistence step
  - `app/services/supabase/storage.ts` and `app/services/supabase/signed_urls.ts` for storage access and signed URLs
  - `app/services/previews/*` or equivalent for resolving `personalization_id` to stored preview output
  - `prisma/schema.prisma` and migrations if a new table/fields are needed

### References

- [Source: _bmad-output/planning-artifacts/epics.md#story-7.2] - Story requirements and acceptance criteria
- [Source: _bmad-output/planning-artifacts/architecture.md#asset-security] - Private storage + signed URLs
- [Source: _bmad-output/planning-artifacts/architecture.md#idempotency--retries] - Idempotent workflow steps
- [Source: _bmad-output/planning-artifacts/architecture.md#workflow-boundaries] - Inngest boundaries and payload validation
- [Source: _bmad-output/planning-artifacts/prd.md#integrations-supplier-fulfillment-mvp-printify] - Fulfillment context
- [Source: AGENTS.md] - Critical implementation rules

## Dev Agent Record

### Agent Model Used

openai/gpt-5.2-codex

### Debug Log References

- `git log -5 --name-status`

### Completion Notes List

- Story 7.2 context synthesized from epics, PRD, architecture, and prior story 7.1 learnings.
- Guardrails added for secure storage, idempotency, and signed URL access.

### File List

- \_bmad-output/implementation-artifacts/7-2-final-print-ready-asset-generated-preview-persist-retrieve.md

## Previous Story Intelligence

- Story 7.1 established `order_line_processing` and idempotent webhook intake using `{shop_id}:{order_line_id}:{step_name}` keys.
- Billing logic is async in Inngest; webhook handlers must return quickly and avoid heavy work.
- Order line detection uses `line_item.properties` to find `personalization_id`.

## Git Intelligence Summary

- Recent commits show active work in app-proxy routes, storefront stepper, and Inngest workflows; keep patterns consistent with existing route/service boundaries.
- Epic 7 foundation (webhooks + fulfillment trigger) already landed; build asset persistence within the existing fulfillment workflow.

## Project Context Reference

- Unified agent rules and stack constraints: `_bmad-output/project-context.md`

## Story Completion Status

Status set to **ready-for-dev**.
Completion note added: “Ultimate context engine analysis completed - comprehensive developer guide created”.
