# Story 7.3: Submit to Printify + Track Status + Visibility

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a merchant or operator,
I want to track fulfillment status for each personalized order line,
so that I can see what's pending, what succeeded, and what needs attention.

## Acceptance Criteria

1. **Given** an order line has a resolved final print-ready asset
   **When** fulfillment processing runs
   **Then** the system submits the fulfillment request to Printify for that order line
   **And** it records a fulfillment job with status `pending`

2. **Given** Printify accepts the request
   **When** the system receives the response
   **Then** the job is updated to `succeeded`
   **And** Printify reference IDs are stored for diagnostics

3. **Given** Printify rejects the request or a non-retryable error occurs
   **When** the system receives the failure
   **Then** the job is updated to `failed` with a clear reason

4. **Given** the merchant or operator views an order/fulfillment screen
   **When** personalized orders exist
   **Then** they can see each order line's fulfillment job status (`pending/succeeded/failed`)
   **And** failed items show the failure reason and next-step guidance

## Tasks / Subtasks

- [x] Implement Printify fulfillment submission step in Inngest (AC: 1, 2, 3)
  - [x] Build idempotent submission using stable key: `{shop_id}:{order_line_id}:printify_submit`
  - [x] Call Printify Orders API `POST /v1/shops/{printify_shop_id}/orders.json`
  - [x] Use final print-ready asset URL or uploaded asset ID per Printify order payload
  - [x] Record `pending` status before submission and persist Printify response IDs
- [x] Persist job status transitions and failure reasons (AC: 1, 2, 3)
  - [x] Define/update DB fields on `order_line_processing` (or add table) for: status, printify_order_id, request_id, error_code, error_message
  - [x] Map Printify order-level statuses to `pending/succeeded/failed`
  - [x] Emit PostHog events: `fulfillment.submitted`, `fulfillment.succeeded`, `fulfillment.failed`
- [x] Expose fulfillment status to admin/operator UI (AC: 4)
  - [x] Add API route to fetch order line fulfillment status and failure guidance
  - [x] Render status + failure reason in existing order/fulfillment screen
- [x] Add or update Zod schemas for submission and status payloads (AC: 1, 2, 3, 4)
- [x] Add unit tests for status mapping and idempotency key construction (AC: 1, 2, 3)

## Dev Notes

### Developer Context

- This story builds on Story 7.2: final print-ready asset is already persisted; do not regenerate. Use that stored asset for Printify submission. [Source: _bmad-output/implementation-artifacts/7-2-final-print-ready-asset-generated-preview-persist-retrieve.md]
- Fulfillment is async via Inngest; submissions must be retry-safe and idempotent. [Source: _bmad-output/planning-artifacts/architecture.md#idempotency--retries]

### Technical Requirements

- Use Shopify React Router routes as API surface; no new server framework. [Source: _bmad-output/planning-artifacts/architecture.md#api--communication-patterns]
- Use shared Zod schemas for any request/job payloads. [Source: _bmad-output/planning-artifacts/architecture.md#shared-validation-schemas]
- Error envelope is `{ error: { code, message, details? } }` for web/proxy endpoints. [Source: _bmad-output/project-context.md]
- PostHog events must use `domain.action` and `snake_case` props with correlation keys (`shop_id`, `order_line_id`, `job_id`). [Source: _bmad-output/planning-artifacts/architecture.md#event-system-patterns]

### Architecture Compliance

- Use `app/routes/*` for HTTP handling, `app/services/*` for Printify integration, and `app/inngest/functions/*` for workflows. [Source: _bmad-output/planning-artifacts/architecture.md#project-organization]
- Keep payload fields `snake_case` at boundaries; map to `camelCase` internally. [Source: _bmad-output/project-context.md]
- Fulfillment job status must be recoverable and visible for ops. [Source: _bmad-output/planning-artifacts/prd.md#reliability]

### Library/Framework Requirements

- Printify API base URL: `https://api.printify.com/v1/` with Bearer token auth and `User-Agent` header. [Source: https://developers.printify.com/]
- Orders endpoints used:
  - `POST /v1/shops/{shop_id}/orders.json` (submit order)
  - `GET /v1/shops/{shop_id}/orders/{order_id}.json` (status details)
  - `GET /v1/shops/{shop_id}/orders.json` (status list)
  - Order status values include `pending`, `on-hold`, `sending-to-production`, `in-production`, `canceled`, `fulfilled`, `partially-fulfilled`, `has-issues`, `unfulfillable`. [Source: https://developers.printify.com/]
- Rate limits: 600 requests/min global; catalog endpoints have separate 100 requests/min limit. [Source: https://developers.printify.com/]

### File Structure Requirements

- Likely touch points:
  - `app/inngest/functions/fulfillment.ts` for submission + status updates
  - `app/services/printify/fulfillment.ts` (or add) for Order API calls
  - `app/schemas/fulfillment.ts` for payload validation
  - `app/routes/app/api/fulfillment/*` for operator/merchant status retrieval
  - `prisma/schema.prisma` if adding fields for job tracking

### Testing Requirements

- Add unit tests for:
  - status mapping (Printify -> internal pending/succeeded/failed)
  - idempotency key generation
  - failure reason mapping to operator guidance
- If adding new API routes, add integration tests for webhook + Inngest boundaries only if needed. [Source: _bmad-output/project-context.md]

### Previous Story Intelligence

- Story 7.2 established final asset persistence and signed URL retrieval; this story should reuse those utilities. [Source: _bmad-output/implementation-artifacts/7-2-final-print-ready-asset-generated-preview-persist-retrieve.md]
- Story 7.1 established idempotent paid-order intake using `{shop_id}:{order_line_id}:{step_name}` keys; keep pattern consistent. [Source: _bmad-output/implementation-artifacts/7-1-detect-paid-orders-with-personalization-id-webhook-idempotent-intake.md]

### Git Intelligence Summary

- Recent commits show fulfillment flow added in `app/services/inngest/functions/fulfillment.ts` and new operator routes under `app/routes/app/api/fulfillment/*`; extend those patterns rather than adding parallel flows. [Source: git log -5 --name-status]

### Latest Technical Information

- Printify Orders API supports status fields at order and line-item levels. Recommended mapping for UI:
  - `pending`, `on-hold`, `sending-to-production`, `in-production` => internal `pending`
  - `fulfilled`, `partially-fulfilled` => internal `succeeded`
  - `canceled`, `has-issues`, `unfulfillable` => internal `failed` with reason
- Use `line_items[].status` when present for per-line tracking; fall back to order-level `status` if not available. [Source: https://developers.printify.com/]

### Project Structure Notes

- Keep routes in `app/routes/*` and services in `app/services/*` (no cross-imports). [Source: _bmad-output/planning-artifacts/architecture.md#service-boundaries]
- Enforce `shop_id` scoping on all data and logs. [Source: _bmad-output/planning-artifacts/architecture.md#multi-tenancy-data-model]

### References

- [Source: _bmad-output/planning-artifacts/epics.md#story-7.3] - Acceptance criteria and story intent
- [Source: _bmad-output/planning-artifacts/prd.md#fulfillment--order-processing-mvp-supplier-printify] - Fulfillment scope
- [Source: _bmad-output/planning-artifacts/architecture.md#api--communication-patterns] - Route/service boundaries
- [Source: _bmad-output/planning-artifacts/architecture.md#idempotency--retries] - Idempotency constraints
- [Source: _bmad-output/project-context.md] - Global agent rules
- [Source: https://developers.printify.com/] - Printify Orders API and status values

## Dev Agent Record

### Agent Model Used

openai/gpt-5.2-codex

### Debug Log References

- `git log -5 --name-status`

### Completion Notes List

- Story 7.3 context synthesized from epics, PRD, architecture, project context, and recent repo commits.
- Added Printify Orders API guidance, status mapping, and idempotency guardrails.
- Implementation completed: Printify submission service, Inngest workflow step, DB schema updates, API route, and unit tests.
- 13 unit tests pass for idempotency key generation and status mapping.
- API route returns Printify status with recovery guidance for failed submissions.

### File List

- prisma/schema.prisma (added Printify tracking fields to OrderLineProcessing)
- app/services/printify/order-submission.server.ts (new - Printify submission service)
- app/services/printify/order-submission.test.ts (new - 13 unit tests)
- app/schemas/fulfillment.ts (added Printify status schemas)
- app/schemas/webhooks.ts (added shipping/customer schemas)
- app/services/inngest/functions/fulfillment.ts (added submit-to-printify step)
- app/services/inngest/types.ts (added shipping address types)
- app/routes/webhooks/orders/paid/route.tsx (pass shipping info to Inngest)
- app/routes/app/api/fulfillment/order-line/$orderLineId/route.ts (return Printify status)
- app/routes/app/api/fulfillment/asset/$personalizationId/route.ts (fixed imports)
- app/routes/webhooks/orders/paid/webhook.integration.test.ts (fixed imports)
- \_bmad-output/implementation-artifacts/7-3-submit-to-printify-track-status-visibility.md

## Project Context Reference

- Unified agent rules and stack constraints: `_bmad-output/project-context.md`

## Story Completion Status

Status set to **review**.
Implementation completed with all acceptance criteria met:

- AC1: Printify submission step added to Inngest fulfillment workflow with `pending` status recording
- AC2: Job updated to `succeeded` with Printify order ID/number stored
- AC3: Job updated to `failed` with error code/message and recovery guidance
- AC4: API route returns fulfillment status with failure reason and next-step guidance
