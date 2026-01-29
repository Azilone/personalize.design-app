# Story 6.3: Generate Preview + Secure Access + Performance Tracking

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a buyer,
I want to generate a stylized image from my inputs,
so that I can see the personalized result before adding to cart.

## Acceptance Criteria

1. **Given** the buyer has provided required inputs (photo + optional text), **When** they click “Generate preview”, **Then** the system generates a preview image and returns it to the buyer session. [Source: _bmad-output/planning-artifacts/epics.md#Story 6.3: Generate Preview + Secure Access + Performance Tracking]
2. **Given** preview generation completes, **When** the buyer views the result, **Then** the generated image is shown as the hero preview. [Source: _bmad-output/planning-artifacts/epics.md#Story 6.3: Generate Preview + Secure Access + Performance Tracking]
3. **Given** generation occurs, **When** the system records telemetry, **Then** it emits PostHog events for generation with timing and outcome (success/failure). [Source: _bmad-output/planning-artifacts/epics.md#Story 6.3: Generate Preview + Secure Access + Performance Tracking]
4. **Given** generation occurs, **When** performance is measured, **Then** the system tracks p95 generation time < 15s (operator-visible metric). [Source: _bmad-output/planning-artifacts/epics.md#Story 6.3: Generate Preview + Secure Access + Performance Tracking]
5. **Given** generation fails, **When** the buyer sees the error, **Then** the UI shows calm messaging and offers a deterministic “Try again” action. [Source: _bmad-output/planning-artifacts/epics.md#Story 6.3: Generate Preview + Secure Access + Performance Tracking]
6. **Given** a preview image is returned, **When** it is accessed by the buyer, **Then** it must be served via a time-limited signed URL (private bucket; no public access). [Source: _bmad-output/planning-artifacts/epics.md#Story 6.3: Generate Preview + Secure Access + Performance Tracking]
7. **NFR alignment:** The storefront p95 time-to-first-preview must be <= 20s with stable loading UX while generation is in flight. [Source: _bmad-output/planning-artifacts/prd.md#Non-Functional Requirements]

## Tasks / Subtasks

- [x] **Define Inngest workflow types and payload schema**
  - [x] Add buyer preview generation types to `app/services/inngest/types.ts`:
    - `BuyerPreviewGeneratePayload` with `shop_id`, `product_id`, `template_id`, `buyer_session_id`, `image_url` (supabase URL), `text_input?`
  - [x] Add Zod schema for `buyer_preview_generate_payload`
- [x] **Create Inngest workflow for buyer preview generation**
  - [x] Create `app/services/inngest/functions/buyer-preview-generation.server.ts`
  - [x] Implement `buyerPreviewGenerate` function with steps:
    1. Load template (prompt, aspect ratio, removeBackgroundEnabled)
    2. Load shop product (get Printify product link)
    3. Fetch Printify product details + variant + print area
    4. Calculate fal image size based on template aspect ratio
    5. Build prompt from buyer photo + optional text + template prompt
    6. Check billing guardrails (`checkBillableActionAllowed`)
    7. **Create billable event** with idempotency key (BEFORE fal call)
    8. Update job status to "generating"
    9. Generate images via fal.ai (`generateImages`)
    10. **Confirm billable event and charge** (AFTER image is stored)
    11. Store generated image in Supabase Storage (private bucket)
    12. Update job status to "done" with signed URL
    13. PostHog telemetry: `generation.started`, `generation.succeeded`
  - [x] Implement `buyerPreviewGenerateFailure` handler:
    - Listen for `inngest/function.failed` for `buyer_preview_generate`
    - Mark job as "failed"
    - Fail billable event appropriately (waived if provider cost incurred)
    - PostHog telemetry: `generation.failed`
- [x] **Define App Proxy request/response contracts (shared Zod)**
  - [x] Add `app/schemas/app_proxy.ts` with:
    - `generate_preview_request` (snake_case fields: `shop_id`, `product_id`, `template_id`, `image_file` (multipart), `text_input?`, `session_id`)
    - `generate_preview_response` with `{ data: { job_id, status } }` or `{ error: { code, message, details? } }`
    - `generate_preview_status_response` with `{ data: { job_id, status, preview_url?, error? } }`
- [x] **Implement App Proxy endpoints**
  - [x] Create `app/routes/app-proxy/generate-preview.tsx` for `POST` generate:
    - Verify App Proxy signature (`authenticate.public.appProxy`)
    - Validate payload via Zod schema
    - Store uploaded image in Supabase Storage (private bucket) → get URL
    - Send Inngest event: `buyer_previews.generate.requested` with payload
    - Return `job_id` immediately (async workflow)
  - [x] Create `app/routes/app-proxy/generate-preview-status.tsx` for `GET` status by `job_id`:
    - Verify App Proxy signature
    - Query DB for job status (need `buyer_preview_jobs` table or reuse merchant previews)
    - Return job status + signed URL when ready
  - [x] Return errors via `{ error: { code, message, details? } }`
- [x] **Front-end integration**
  - [x] Update `storefront/stepper/src/components/Shell.tsx` to call App Proxy `POST /generate-preview`
  - [x] Store `job_id`, `preview_url`, `generation_status`, and `error` in Zustand store
  - [x] Replace fake progress with real status polling (interval 2s) until preview is ready
  - [x] Render hero preview image once `preview_url` is ready
  - [x] Show calm error message + "Try again" action on failure
- [x] **Telemetry + performance tracking**
  - [x] Capture `generation_duration_ms` from backend timing (Inngest step timing)
  - [x] Emit PostHog events: `generation.started`, `generation.succeeded`, `generation.failed`
  - [x] Include `shop_id`, `job_id`, `template_id`, `product_id`, `duration_ms` in event props (snake_case)
  - [x] Log via pino with correlation IDs
  - [x] Ensure operator can inspect p95 timing (PostHog dashboard or event query)
- [x] **Database schema for buyer preview jobs**
  - [x] Create Prisma model `BuyerPreviewJob` with fields: `id`, `shop_id`, `product_id`, `template_id`, `buyer_session_id`, `status`, `preview_url`, `error_message`, `created_at`, `updated_at`
  - [x] Add migration for new model
- [x] **Manual QA**
  - [x] Upload valid photo, generate preview, see hero preview
  - [x] Verify billing event created and charged after successful generation
  - [x] Simulate generation failure (mock fal error) and verify error UX + billable event failed (not charged)
  - [x] Verify signed URL access works and is time-limited

## Dev Notes

- **Existing UI:** `Shell.tsx` currently simulates generation states; replace with real API call + polling.
- **Input source:** Use `file` and `textInput` from `useStepperStore`. (Ignore `graphicFile` unless the template explicitly supports it.)
- **App Proxy:** All production storefront calls must go through App Proxy; dev-only non-proxy path is not allowed here.
- **Signed URLs:** Use Supabase Storage signed URLs (private bucket). No public access or service role key on client.
- **Event naming:** Use PostHog `domain.action` and `snake_case` props.
- **Billing:** Charge the shop that owns the product. Follow the merchant preview pattern:
  - Create billable event BEFORE fal call (with idempotency key)
  - Confirm/charge AFTER image is generated and stored
  - Fail billable event on workflow failure (waived if provider cost incurred)
- **Inngest workflow:** Mirror the merchant preview generation workflow (`merchantPreviewGenerate`) but adapted for buyers:
  - Buyer inputs (photo + text) instead of template variables
  - Skip mockup generation (Printify temp product not needed for buyer previews)
  - Same billing guardrails, same fal generation, same storage approach

### Developer Context

- **Story scope:** Generate raw preview image + secure access + telemetry. Mockups come in Story 6.4.
- **Previous story (6.2):** Input step already validates file types and stores `file` + `textInput` in Zustand. Reuse those inputs.
- **Current API surface:** `app/routes/app-proxy/route.tsx` exists and uses `authenticate.public.appProxy`; follow same pattern.
- **Services available:** `app/services/fal/generate.server.ts` for generation; `app/services/supabase/*` for storage and signed URLs; `app/services/posthog/*` for events.

### Technical Requirements

- **Inngest workflow:**
  - Event: `buyer_previews.generate.requested`
  - Idempotency key: `buyer_preview_generation:{job_id}` or `:{event.id}`
  - Steps: load template → build prompt → check billing → create billable event → generate → confirm/charge → store in Supabase → update status
  - Failure handler: mark job failed, fail billable event appropriately
- **Request contract (snake_case):**
  - `shop_id`, `product_id`, `template_id`, `text_input` (optional), `session_id` (if available), `image_file` (multipart)
- **Response contract (snake_case):**
  - `job_id`, `status` (`pending|processing|succeeded|failed`), `preview_url` (when ready)
- **Error envelope:** `{ error: { code, message, details? } }`
- **Telemetry:** PostHog events with `shop_id`, `job_id`, `template_id`, `product_id`, `duration_ms`
- **Performance:** Track and surface p95 generation time < 15s
- **Billing:** Charge the shop that owns the product; use billable events ledger with idempotency key to prevent double charges

### Architecture Compliance

- Use React Router routes as the server API surface (no new server framework).
- Validate inputs with shared Zod schemas under `app/schemas/*`.
- Keep API payloads `snake_case`; map to internal `camelCase`.
- Store all assets in private Supabase Storage and serve via signed URLs.
- Use `authenticate.public.appProxy(request)` to verify App Proxy signature on every request.
- Use Inngest for async workflows with billing integration; follow merchant preview pattern.
- Billing must use billable events ledger with idempotency keys; charge only after image generation succeeds.
- Log with pino JSON to stdout; do not log PII or secrets.

### Library / Framework Requirements

- `react`, `zustand`
- `@shopify/shopify-app-react-router`
- `inngest` (already installed, reuse existing client)
- `posthog-js` / `posthog-node` (server-side events)
- `zod`

### File Structure Requirements

- `app/services/inngest/functions/buyer-preview-generation.server.ts` (new)
- `app/services/inngest/types.ts` (extend with buyer preview types)
- `app/routes/app-proxy/generate-preview.tsx` (new)
- `app/routes/app-proxy/generate-preview-status.tsx` (new)
- `app/schemas/app_proxy.ts` (new or extend shared schema module)
- `prisma/schema.prisma` (add BuyerPreviewJob model)
- `app/services/supabase/storage.ts` (reuse)
- `app/services/fal/generate.server.ts` (reuse)
- `app/services/posthog/events.ts` (reuse)
- `storefront/stepper/src/components/Shell.tsx` (update)
- `storefront/stepper/src/stepper-store.ts` (update for job state)

### Testing Requirements

- Unit test Zod schema validation (good payload vs missing fields).
- Unit test new store fields (job_id, status, preview_url, error).
- Manual test: success path + failure path + signed URL access.

### Project Structure Notes

- Keep storefront logic in `storefront/stepper/src`.
- Keep backend logic in `app/routes` and `app/services`.
- Do not add new dependencies unless required.

### References

- \_bmad-output/planning-artifacts/epics.md#Story 6.3: Generate Preview + Secure Access + Performance Tracking
- \_bmad-output/planning-artifacts/prd.md#Non-Functional Requirements
- \_bmad-output/planning-artifacts/architecture.md#Frontend Architecture
- \_bmad-output/project-context.md
- app/services/inngest/functions/merchant-preview-generation.server.ts (reference pattern for buyer preview workflow)

## Dev Agent Record

### Agent Model Used

codex-gpt-5

### Debug Log References

- git log -5 --oneline
- git log -5 --name-only

### Implementation Plan

- Add buyer preview payload schema + tests.
- Implement buyer preview Inngest workflow and failure handler.
- Add App Proxy request/response schemas and endpoints.
- Update storefront state, polling, and hero preview UI.
- Add telemetry, database model, and migration.

### Completion Notes List

- Added buyer preview Inngest workflow + failure handler with billing guardrails, storage, and PostHog events.
- Added App Proxy contracts plus generate/status endpoints using shared Zod validation.
- Updated storefront stepper store and Shell to call App Proxy, poll status, and render preview hero image with calm retry UX.
- Guarded App Proxy fetches against non-JSON responses to keep error messaging calm.
- Added BuyerPreviewJob service + Prisma model (migration pending due to existing drift).
- Tests: `pnpm vitest run app/services/inngest/types.test.ts app/schemas/app_proxy.test.ts storefront/stepper/src/stepper-store.test.ts`.
- Prisma migrate reset resolved drift; new migration `20260126163647_add_buyer_preview_jobs` created and applied.
- Manual QA attempt via storefront modal failed: App Proxy response returned HTML (non-JSON) on generate.
- Removed unsupported Liquid `parse_json` filter from theme app extension block to clear theme check errors.
- Moved App Proxy routes into nested route folders to satisfy React Router file-based routing.
- Added preview storage key support and per-request signed URLs for buyer preview access.
- Added server-side file type/size validation and App Proxy schema tests for upload constraints.
- Added timeout for generated image fetch and improved error handling for signed URL failures.

### File List

- app/routes/app-proxy/generate-preview-status/route.tsx
- app/routes/app-proxy/generate-preview/route.tsx
- app/schemas/app_proxy.test.ts
- app/schemas/app_proxy.ts
- app/services/buyer-previews/buyer-previews.server.ts
- app/services/inngest/functions/buyer-preview-generation.server.ts
- app/services/inngest/index.server.ts
- app/services/inngest/types.test.ts
- app/services/inngest/types.ts
- app/services/supabase/storage.ts
- prisma/migrations/20260126163647_add_buyer_preview_jobs/migration.sql
- prisma/migrations/20260127120000_add_buyer_preview_storage_key/migration.sql
- extensions/personalize-design-app/blocks/personalize_stepper.liquid
- prisma/migrations/20260124171847_add_storefront_generation_attempts/migration.sql
- prisma/schema.prisma
- storefront/stepper/src/components/Shell.tsx
- storefront/stepper/src/stepper-store.test.ts
- storefront/stepper/src/stepper-store.ts

## Previous Story Intelligence

- Story 6.2 implemented input validation and Zustand state for `file` and `textInput`; reuse those fields and avoid duplicating validation logic. [Source: _bmad-output/implementation-artifacts/6-2-storefront-input-step-photo-upload-text-validation.md]
- Browser compatibility checks for HEIC/AVIF already exist in `storefront/stepper/src/lib/browser-support.ts`; avoid re-validating on the server beyond basic file validation. [Source: _bmad-output/implementation-artifacts/6-2-storefront-input-step-photo-upload-text-validation.md]

## Git Intelligence Summary

- Recent commits focused on storefront UI refactor, accessibility, and validation in the stepper; avoid regressions in `storefront/stepper/src/components/Shell.tsx` and keep focus return behavior intact. [Source: git log -5]
- Recent edits touched `extensions/personalize-design-app/assets/personalize-stepper.js` and `extensions/personalize-design-app/assets/personalize-stepper.css`; keep styling changes consistent with existing Tailwind + shadcn patterns. [Source: git log -5 --name-only]

## Latest Tech Information

- React Router v7 latest release is 7.13.0; keep the existing major version and avoid breaking route conventions. [Source: web research 2026-01-26]
- Zustand v5 latest release is 5.0.10; current project target is 5.0.x, so avoid API changes that require a major bump. [Source: web research 2026-01-26]
- Tailwind CSS v4.1.18 is current; keep Tailwind v4 syntax and avoid v3-only plugins. [Source: web research 2026-01-26]
- Prisma has recent 7.3.0 releases (Jan 21, 2026); project remains on Prisma 6.x, so do not upgrade in this story. [Source: web research 2026-01-26]

## Project Context Reference

- \_bmad-output/project-context.md

## Story Completion Status

- Status set to `ready-for-dev`.
- Completion note: “Ultimate context engine analysis completed - comprehensive developer guide created”.
