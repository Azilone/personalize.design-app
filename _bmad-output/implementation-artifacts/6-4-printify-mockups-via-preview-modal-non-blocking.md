# Story 6.4: Printify Mockups via "Preview" Modal (Non-Blocking)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a buyer,
I want to preview my generated design on product mockups in a modal,
so that I can trust what I'm buying without blocking purchase.

## Acceptance Criteria

1. **Given** a preview image was generated successfully, **When** the result step is shown, **Then** the system triggers Printify mockup generation in the background. [Source: _bmad-output/planning-artifacts/epics.md#Story 6.4: Printify Mockups via “Preview” Modal (Non-Blocking)]
2. **Given** the buyer is viewing the result step, **When** they click “Preview”, **Then** a modal opens displaying available mockups (carousel/gallery). [Source: _bmad-output/planning-artifacts/epics.md#Story 6.4: Printify Mockups via “Preview” Modal (Non-Blocking)]
3. **Given** mockup generation is still running, **When** the buyer opens the modal, **Then** the modal shows a clear loading state and updates when mockups arrive. [Source: _bmad-output/planning-artifacts/epics.md#Story 6.4: Printify Mockups via “Preview” Modal (Non-Blocking)]
4. **Given** mockup generation fails, **When** the buyer opens the modal, **Then** the modal shows a calm error and a deterministic retry action (“Try again”). [Source: _bmad-output/planning-artifacts/epics.md#Story 6.4: Printify Mockups via “Preview” Modal (Non-Blocking)]
5. **Given** mockups are not ready or fail, **When** the buyer is on the result step, **Then** they can still proceed to Add to cart using the generated preview (mockups never block purchase). [Source: _bmad-output/planning-artifacts/epics.md#Story 6.4: Printify Mockups via “Preview” Modal (Non-Blocking)]
6. **UX requirement:** The preview modal is focus-trapped and ESC-dismissible, and is informational only (does not gate add-to-cart). [Source: _bmad-output/planning-artifacts/epics.md#Additional Requirements]

## Tasks / Subtasks

- [x] **Trigger buyer mockups after preview generation** (AC: 1)
  - [x] Update Inngest preview flow to kick off mockup generation for buyer jobs (or split into a background step) after design is stored.
  - [x] Persist `mockup_urls` + mockup status on `preview_jobs` and keep temp Printify product cleanup in the workflow.
- [x] **Expose mockup status via App Proxy** (AC: 2, 3, 4)
  - [x] Ensure `app-proxy/generate-preview-status` returns `mockup_urls` and a mockup-specific status/error when available.
  - [x] Keep JSON error envelope `{ error: { code, message, details? } }` on failures.
- [x] **Storefront preview modal UX** (AC: 2, 3, 4, 5, 6)
  - [x] Update stepper state to track mockup loading/error in addition to `preview_url`.
  - [x] Render modal carousel with real mockups, show loading state when absent, and retry button on failure.
  - [x] Ensure modal is focus-trapped, ESC dismissible, and does not block Add to cart.
- [x] **Telemetry and logging**
  - [x] Emit PostHog events for `mockups.started`, `mockups.succeeded`, `mockups.failed` with correlation keys.
  - [x] Log failures with `shop_id`, `job_id`, `printify_product_id` (no PII).
- [ ] **Manual QA**
  - [ ] Happy path: mockups appear in modal without blocking add-to-cart.
  - [ ] Failure path: mockups error shows retry while add-to-cart stays enabled.

## Dev Notes

- **Existing mockup pipeline:** `generateMockups` creates a temp Printify product and extracts mockup URLs from product images; cleanup uses `deleteProduct` after completion. [Source: app/services/previews/mockup-generation.server.ts, app/services/printify/temp-product.server.ts]
- **Current preview flow:** `preview-generate` short-circuits for buyer type and does not currently generate mockups; extend it to run mockups in background for buyers. [Source: app/services/inngest/functions/preview-generate.server.ts]
- **App Proxy status payloads:** Buyer status endpoint already returns `mockup_urls`; ensure the job updates fill this for buyer runs. [Source: app/routes/app-proxy/generate-preview-status/route.tsx]
- **Billing:** Printify mockups are not billable; do not create billable events for mockup generation. [Source: _bmad-output/planning-artifacts/prd.md#Spend Safety / Consent]
- **UX:** Desktop uses modal, mobile uses full-screen drawer; keep focus trap + ESC dismissal and non-blocking add-to-cart. [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture]

### Developer Context

- Story 6.3 implemented buyer preview generation + polling; mockups should piggyback on the same preview job. [Source: _bmad-output/implementation-artifacts/6-3-generate-raw-design-display-loading-states.md]
- Keep storefront API calls through App Proxy; dev-only bypass is not allowed for production storefront traffic. [Source: _bmad-output/project-context.md]

### Technical Requirements

- **Inngest:** Add/extend a mockup generation step after preview generation for buyer jobs; preserve idempotency keys per step. [Source: _bmad-output/planning-artifacts/architecture.md#Idempotency & Retries (Inngest + Webhooks)]
- **Preview job updates:** Store `mockup_urls` on `preview_jobs`, update status progression (`creating_mockups` -> `done`), and preserve temp product ID for cleanup. [Source: app/services/previews/preview-jobs.server.ts]
- **Security:** Mockups can be public Printify URLs, but keep all preview design assets in private Supabase storage with signed URLs. [Source: _bmad-output/planning-artifacts/architecture.md#Asset Security]
- **Error handling:** Return `{ error: { code, message, details? } }` from proxy endpoints; keep calm user-facing copy. [Source: _bmad-output/project-context.md]

### Architecture Compliance

- React Router routes as API surface (`app/routes/app-proxy/*`). [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns]
- Integrations live in `app/services/*`; routes must not be imported by services. [Source: _bmad-output/planning-artifacts/architecture.md#Architectural Boundaries]
- Use shared Zod schemas for App Proxy payload validation and `snake_case` wire fields. [Source: _bmad-output/planning-artifacts/architecture.md#Shared Validation Schemas]

### Library / Framework Requirements

- React + Zustand storefront state management, Tailwind + shadcn-style primitives for modal and carousel. [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture]
- Inngest for mockup workflow orchestration. [Source: _bmad-output/planning-artifacts/architecture.md#Async Orchestration]

### File Structure Requirements

- `app/services/inngest/functions/preview-generate.server.ts` (extend buyer flow to generate mockups)
- `app/services/previews/mockup-generation.server.ts`
- `app/services/printify/temp-product.server.ts`
- `app/services/previews/preview-jobs.server.ts`
- `app/routes/app-proxy/generate-preview-status/route.tsx`
- `storefront/stepper/src/components/Shell.tsx`
- `storefront/stepper/src/stepper-store.ts`

### Testing Requirements

- Unit test: preview job updates when mockups complete (store `mockup_urls`, status transition).
- Manual: mockups loading -> success -> modal display; error -> retry; ensure add-to-cart remains available.

### Project Structure Notes

- Keep storefront logic in `storefront/stepper/src` and backend orchestration in `app/services/inngest/*`.
- Use existing Printify temp product flow for mockups; no new endpoints required.

### References

- \_bmad-output/planning-artifacts/epics.md#Story 6.4: Printify Mockups via “Preview” Modal (Non-Blocking)
- \_bmad-output/planning-artifacts/prd.md#Spend Safety / Consent
- \_bmad-output/planning-artifacts/architecture.md#Frontend Architecture
- \_bmad-output/planning-artifacts/architecture.md#Async Orchestration
- app/services/previews/mockup-generation.server.ts
- app/services/printify/temp-product.server.ts
- app/services/inngest/functions/preview-generate.server.ts
- app/routes/app-proxy/generate-preview-status/route.tsx

## Previous Story Intelligence

- Story 6.3 already implemented preview polling and uses `preview_jobs`; extend that flow rather than adding a parallel job system. [Source: _bmad-output/implementation-artifacts/6-3-generate-raw-design-display-loading-states.md]
- Preserve existing accessibility behavior in `Shell.tsx` when adding modal loading/error states. [Source: _bmad-output/implementation-artifacts/6-3-generate-raw-design-display-loading-states.md]

## Git Intelligence Summary

- Recent commits touched preview generation services, App Proxy status routes, and storefront stepper UI; avoid regressions in `Shell.tsx` and `preview-generate.server.ts`. [Source: git log -5 --name-only]

## Latest Tech Information

- Current mockup generation relies on Printify temp product creation and product detail image retrieval; keep this pattern unless Printify introduces a dedicated mockup endpoint. [Source: app/services/printify/temp-product.server.ts]

## Project Context Reference

- \_bmad-output/project-context.md

## Story Completion Status

- Status set to `ready-for-dev`.
- Completion note: "Ultimate context engine analysis completed - comprehensive developer guide created".

## Dev Agent Record

### Agent Model Used

openai/gpt-5.2-codex

### Debug Log References

- git log -5 --oneline
- git log -5 --name-only

### Completion Notes List

- Drafted comprehensive context for buyer mockup preview modal with non-blocking UX and Printify temp product workflow.
- ✅ Implemented buyer mockup generation in background after preview completes (non-blocking)
- ✅ Added `mockups_failed` status to Prisma schema for tracking mockup failures
- ✅ Updated App Proxy status endpoint to return `mockup_status` field (loading/ready/error)
- ✅ Created retry-mockups endpoint and Inngest function for deterministic retry
- ✅ Updated Zustand store with mockup state (urls, status, error)
- ✅ Updated Shell.tsx to display real mockups with loading states and retry UI
- ✅ Added PostHog telemetry events: mockups.started, mockups.succeeded, mockups.failed, mockups.retry_requested, mockups.retry_started, mockups.retry_succeeded, mockups.retry_failed
- ✅ Added structured logging with shop_id, job_id, printify_product_id correlation keys
- ✅ Modal maintains focus-trap and ESC dismissal; Add to cart never blocked by mockups

### File List

- prisma/schema.prisma (added `mockups_failed` to PreviewJobStatus enum, added `mockup_error_message` field)
- prisma/migrations/20260129102640_add_mockups_failed_status/ (migration for mockups_failed enum)
- app/services/inngest/functions/preview-generate.server.ts (added mockup generation for buyer jobs, added mockupsRetry function)
- app/services/previews/preview-jobs.server.ts (updated UpdatePreviewJobParams type, added mockup_error_message to PreviewJobRecord)
- app/routes/app-proxy/generate-preview-status/route.tsx (added mockup_status to response)
- app/routes/app-proxy/retry-mockups/route.tsx (new endpoint for retrying mockups)
- app/schemas/app_proxy.ts (updated status enum to include mockups_failed)
- storefront/stepper/src/stepper-store.ts (added mockup state management)
- storefront/stepper/src/components/Shell.tsx (updated to use real mockups, added loading/error states, added mockup timeout mechanism)
- \_bmad-output/implementation-artifacts/6-4-printify-mockups-via-preview-modal-non-blocking.md
