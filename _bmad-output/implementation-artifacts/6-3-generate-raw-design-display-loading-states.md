# Story 6.3: Generate Preview + Secure Access + Performance Tracking

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a buyer,
I want to generate a preview image from my inputs,
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

- [ ] **Define request/response contracts (shared Zod)**
  - [ ] Add `app/schemas/app_proxy.ts` (or extend existing shared schema module) with:
    - `generate_preview_request` (snake_case fields)
    - `generate_preview_response` with `{ data: { job_id, preview_url?, status } }` or `{ error: { code, message, details? } }`
    - `generate_preview_status_response` for polling
- [ ] **Implement App Proxy endpoints**
  - [ ] Create `app/routes/app-proxy/generate-preview.tsx` (or equivalent React Router file-based route) for `POST` generate
  - [ ] Create `app/routes/app-proxy/generate-preview-status.tsx` (or similar) for `GET` status by `job_id`
  - [ ] Use `authenticate.public.appProxy(request)` on all proxy routes
  - [ ] Validate payloads via shared Zod schemas
  - [ ] Return errors via `{ error: { code, message, details? } }`
- [ ] **Generation workflow**
  - [ ] Store uploaded image in Supabase Storage (private bucket)
  - [ ] Call `app/services/fal/generate.server.ts` to generate image
  - [ ] Persist preview output and return signed URL
  - [ ] Emit PostHog events: `generation.started`, `generation.succeeded`, `generation.failed`
  - [ ] Include `shop_id`, `job_id`, `template_id`, `product_id`, `duration_ms` in event props (snake_case)
- [ ] **Front-end integration**
  - [ ] Update `storefront/stepper/src/components/Shell.tsx` to call the App Proxy `POST` on Generate
  - [ ] Store `job_id`, `preview_url`, `generation_status`, and `error` in Zustand
  - [ ] Replace fake progress with real status polling (interval 2s) until preview is ready
  - [ ] Render hero preview image once `preview_url` is ready
  - [ ] Show calm error message + “Try again” action on failure
- [ ] **Telemetry + performance tracking**
  - [ ] Capture `generation_duration_ms` from backend timing
  - [ ] Emit PostHog events and log via pino with correlation IDs
  - [ ] Ensure operator can inspect p95 timing (PostHog dashboard or event query)
- [ ] **Manual QA**
  - [ ] Upload valid photo, generate preview, and see hero preview
  - [ ] Simulate generation failure (mock fal error) and verify error UX
  - [ ] Verify signed URL access works and is time-limited

## Dev Notes

- **Existing UI:** `Shell.tsx` currently simulates generation states; replace with real API call + polling.
- **Input source:** Use `file` and `textInput` from `useStepperStore`. (Ignore `graphicFile` unless the template explicitly supports it.)
- **App Proxy:** All production storefront calls must go through App Proxy; dev-only non-proxy path is not allowed here.
- **Signed URLs:** Use Supabase Storage signed URLs (private bucket). No public access or service role key on client.
- **Event naming:** Use PostHog `domain.action` and `snake_case` props.
- **Billing:** Do not charge here; billing occurs only after image is generated and stored (per architecture rules).

### Developer Context

- **Story scope:** Generate raw preview image + secure access + telemetry. Mockups come in Story 6.4.
- **Previous story (6.2):** Input step already validates file types and stores `file` + `textInput` in Zustand. Reuse those inputs.
- **Current API surface:** `app/routes/app-proxy/route.tsx` exists and uses `authenticate.public.appProxy`; follow same pattern.
- **Services available:** `app/services/fal/generate.server.ts` for generation; `app/services/supabase/*` for storage and signed URLs; `app/services/posthog/*` for events.

### Technical Requirements

- **Request contract (snake_case):**
  - `shop_id`, `product_id`, `template_id`, `text_input` (optional), `session_id` (if available), `image_file` (multipart)
- **Response contract (snake_case):**
  - `job_id`, `status` (`pending|processing|succeeded|failed`), `preview_url` (when ready)
- **Error envelope:** `{ error: { code, message, details? } }`
- **Telemetry:** PostHog events with `shop_id`, `job_id`, `template_id`, `product_id`, `duration_ms`
- **Performance:** Track and surface p95 generation time < 15s

### Architecture Compliance

- Use React Router routes as the server API surface (no new server framework).
- Validate inputs with shared Zod schemas under `app/schemas/*`.
- Keep API payloads `snake_case`; map to internal `camelCase`.
- Store all assets in private Supabase Storage and serve via signed URLs.
- Use `authenticate.public.appProxy(request)` to verify App Proxy signature on every request.
- Log with pino JSON to stdout; do not log PII or secrets.

### Library / Framework Requirements

- `react`, `zustand`
- `@shopify/shopify-app-react-router`
- `inngest`
- `posthog-js` / `posthog-node` (server-side events)
- `zod`

### File Structure Requirements

- `app/routes/app-proxy/generate-preview.tsx` (new)
- `app/routes/app-proxy/generate-preview-status.tsx` (new)
- `app/schemas/app_proxy.ts` (new or extend shared schema module)
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

- _bmad-output/planning-artifacts/epics.md#Story 6.3: Generate Preview + Secure Access + Performance Tracking
- _bmad-output/planning-artifacts/prd.md#Non-Functional Requirements
- _bmad-output/planning-artifacts/architecture.md#Frontend Architecture
- _bmad-output/project-context.md

## Dev Agent Record

### Agent Model Used

codex-gpt-5

### Debug Log References

- git log -5 --oneline
- git log -5 --name-only

### Completion Notes List

- Added detailed API contracts and required Zod schemas for App Proxy generate + status.
- Mapped backend flow to existing fal + supabase services with signed URLs.
- Specified PostHog event naming, props, and duration tracking.
- Defined frontend store fields + polling strategy for generation status.
- Added testing expectations for schemas and store updates.

### File List

- app/routes/app-proxy/generate-preview.tsx
- app/routes/app-proxy/generate-preview-status.tsx
- app/schemas/app_proxy.ts
- storefront/stepper/src/components/Shell.tsx
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

- _bmad-output/project-context.md

## Story Completion Status

- Status set to `ready-for-dev`.
- Completion note: “Ultimate context engine analysis completed - comprehensive developer guide created”.
