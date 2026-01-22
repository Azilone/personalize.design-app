# Story 4.3: Merchant Product Preview Simulator (with Format & Printify Mockups)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a merchant,
I want to preview the personalization experience for a product (including "cover print area" dynamic sizing) and generate real Printify mockups,
so that I can validate the design quality and download assets to use as my Shopify product images.

## Acceptance Criteria

1. **Template Format Configuration (Pre-req):**
   - The Template Builder must allow selecting a base Aspect Ratio (e.g., 1:1, 3:4, 4:3, 9:16, 16:9). (use mcp fal.ai docs)
   - This selection is saved with the `DesignTemplate`.

2. **Simulator UI & Inputs:**
   - The product configuration page (`app/products/$productId`) shows a "Test & Preview" section (only if a template is assigned).
   - Merchant can upload a test image and enter test text (if variables exist).
   - Merchant can toggle **"Cover entire print area"**:
     - **If ON:** The generation uses the exact aspect ratio/resolution of the Printify print area for this product.
     - **If OFF:** The generation uses the Template's base aspect ratio.

3. **Generation Workflow (Preview):**
   - Clicking "Generate Preview" triggers a backend workflow:
     - **Step 1 (AI):** Generates the design using `fal.ai` with the calculated aspect ratio/dimensions.
     - **Step 2 (Tools):** Applies "Remove Background" if enabled in the template.
     - **Step 3 (Mockup):** Creates a **temporary** Printify product (Draft), uploads the generated image to the print area, fetches the mockup images, and then **deletes** the temporary product (load printify skills if needed).

4. **Results & Downloads:**
   - The UI displays **Generated Design** (raw AI output) and **Printify Mockups**.
   - Merchant can **Download** the generated design (high-res PNG).
   - Merchant can **Download** any of the Printify mockups.
   - (Goal: Merchant uses these downloads to update their Shopify product listing images manually).

5. **Failure Handling:**
   - If the workflow fails (AI error, Printify error, timeout), the UI displays a clear error message explaining what went wrong (e.g., "Printify API error: Unable to create mockup product").
   - The temporary Printify product is **always deleted**, even if the workflow fails.

## Tasks / Subtasks

- [x] **Schema & Template Updates**
  - [x] Update `DesignTemplate` Prisma model to include `aspect_ratio` (String/Enum).
  - [x] Run migration.
  - [x] Update `TemplateBuilder` UI to include Aspect Ratio selector (1:1, 3:4, 4:3, 9:16, 16:9).

- [x] **Service Layer: Printify Mockup Workflow**
  - [x] Create `app/services/printify/temp-product.server.ts` (or similar).
  - [x] Implement `createTempProduct(shopId, blueprintId, printProviderId, variants, printAreaImage)`:
    - Creates a product on Printify.
    - Returns the Product ID and Mockup URLs.
  - [x] Implement `deleteProduct(shopId, productId)` for cleanup.
  - [x] **Orchestration:** Ensure this runs robustly (try/finally delete).

- [x] **Service Layer: Dynamic Aspect Ratio Logic**
  - [x] Implement logic to fetch Printify Variant "Print Area" dimensions.
  - [x] Implement logic to calculate `image_size` for Fal.ai:
    - Input: `coverPrintArea` (bool), `templateAspectRatio`, `printAreaDimensions`.
    - Output: `{ width, height }`.

- [x] **Admin UI: Simulator Panel**
  - [x] Create `SimulatorPanel` component in `app/routes/app/products/$productId/route.tsx`.
  - [x] Implement form state (Image Upload, Text Inputs, Cover Toggle).
  - [x] Implement "Generate" action (calls a new action or resource route).
  - [x] Display Loading State (this is a multi-step process, likely 10s+).
  - [x] Display Results Gallery (AI Result + Mockups).
  - [x] Add "Download" buttons (ensure headers allow download/blob handling).

- [x] **Backend: Inngest Workflow**
  - [x] Create `app/inngest/functions/merchant-preview-generation.ts`.
  - [x] **Step 1 (AI):** Generate design (Fal.ai) with dynamic aspect ratio.
  - [x] **Step 2 (Tools):** Apply Remove BG if enabled.
  - [x] **Step 3 (Mockup):**
    - Create temporary Printify Product.
    - Poll for mockup availability (or fetch immediately if available).
  - [x] **Step 4 (Persistence):** Store asset URLs (Design + Mockups) in DB (`merchant_previews` table) with `shop_id`, `job_id`, `status`.
  - [x] **Step 5 (Cleanup - Guaranteed):** Delete Printify temporary product (run in `finally` or step with `onError` handling).

- [x] **Admin UI: Polling & Status**
  - [x] Create a "MerchantPreviews" Prisma model to track job status/results.
  - [x] Implement polling hook in UI (poll `app/routes/app/api/preview/$jobId`).
  - [x] Display states: `Queued`, `Generating`, `Creating Mockups`, `Done`, `Failed`.

## Dev Agent Record

### Agent Model Used

gpt-4.1

### Implementation Plan

- Add an enum-backed `aspect_ratio` column with a default to `DesignTemplate` and wire it through template DTOs and actions.
- Add a shared aspect ratio constants helper for schema validation and UI options.
- Update template create/edit screens to persist and display the base aspect ratio.

### Debug Log References

- `pnpm prisma migrate reset --force`
- `pnpm prisma migrate dev --name add-template-aspect-ratio`
- `pnpm prisma migrate dev --name add-merchant-previews`
- `pnpm test -- app/services/templates/templates.server.test.ts`
- `pnpm test -- app/services/printify/temp-product.server.test.ts`
- `pnpm test -- app/services/printify/print-area.server.test.ts`
- `pnpm test -- app/services/merchant-previews/merchant-previews.server.test.ts`
- `pnpm test`

### Completion Notes List

- Added template aspect ratio enum, defaults, and persistence in Prisma + services.
- Added aspect ratio selection UI for template creation and editing.
- Added tests for aspect ratio persistence and reset TTL cache helper for readiness tests.
- Added Printify temp product service with image upload, mockup fetch, and delete workflow coverage.
- Added Printify print area fetch and fal.ai image size calculator for cover vs template ratios.
- Added simulator panel with preview form state, generation action, loading states, and download-ready results UI.
- Added merchant preview persistence model and Inngest workflow to generate designs and mockups with cleanup.
- Added preview polling route and UI status tracking for queued/in-progress/completed jobs.
- Added template test generation image_size mapping based on base aspect ratio.

### File List

- app/lib/template-aspect-ratios.ts
- app/lib/ttl-cache.server.ts
- app/routes/app/products/$productId/route.tsx
- app/routes/app/api/preview/$jobId/route.ts
- app/routes/app/templates/$templateId/route.tsx
- app/routes/app/templates/new/route.tsx
- app/schemas/admin.ts
- app/services/inngest/functions/merchant-preview-generation.server.ts
- app/services/inngest/functions/template-test-generate.server.ts
- app/services/inngest/index.server.ts
- app/services/inngest/types.ts
- app/services/fal/image-size.server.test.ts
- app/services/fal/image-size.server.ts
- app/services/fal/generate.server.ts
- app/services/fal/models/seedream-v4-edit.ts
- app/services/fal/types.ts
- app/services/merchant-previews/merchant-previews.server.test.ts
- app/services/merchant-previews/merchant-previews.server.ts
- app/services/printify/print-area.server.test.ts
- app/services/printify/print-area.server.ts
- app/services/printify/product-details.server.test.ts
- app/services/printify/product-details.server.ts
- app/services/printify/request.server.ts
- app/services/printify/temp-product.server.test.ts
- app/services/printify/temp-product.server.ts
- app/services/shops/readiness.server.test.ts
- app/services/templates/templates.server.test.ts
- app/services/templates/templates.server.ts
- prisma/migrations/20260122123519_add_merchant_previews/migration.sql
- prisma/migrations/20260122121240_add_template_aspect_ratio/migration.sql
- prisma/schema.prisma

### Change Log

- 2026-01-22: Added template aspect ratio support across schema, services, and admin UI.
- 2026-01-22: Added Printify temp product create/delete service for preview mockups.
- 2026-01-22: Added Printify print area lookup and fal.ai image size calculation helpers.
- 2026-01-22: Added admin simulator panel UI and preview request action scaffolding.
- 2026-01-22: Added merchant preview persistence + Inngest workflow for preview generation.
- 2026-01-22: Added preview polling API route and UI status updates.
- 2026-01-22: Added template test generation image_size mapping for fal.ai.
- 2026-01-22: **[Code Review]** Fixed duplicate Inngest step names (H2), added try-catch to cleanup block (H1), added upfront Printify validation in UI (M1), removed console.log debug statements (M4).
- 2026-01-22: **[Bug Fix]** Fixed Printify catalog variants API schema - returns direct array, not `{ data: [...] }`.

## Dev Notes

- **"Cover Print Area" Logic:**
  - You need the Printify Blueprint ID and Print Provider ID associated with the Shopify Product.
  - Use `app/services/printify/client.ts` to fetch blueprint details if not already stored, or inspect the existing mapped product.
  - The "Print Area" is usually defined in the `placeholders` or `print_areas` of the blueprint. Use the `width` and `height` from there.

- **Fal.ai `image_size`:**
  - The `fal-ai/bytedance/seedream/v4/edit` model supports `image_size`. Pass `{ width, height }` explicitly.

- **Temp Product Cleanup:**
  - **CRITICAL:** Ensure the temporary Printify product is deleted even if fetching mockups fails. Use a `try...finally` block.
  - If we don't delete, the merchant's Printify account will fill up with junk "Preview" products. Use Inngest `finally` or `onError` to ensure cleanup happens even on failure.

- **Downloads:**
  - Provide direct links to the Supabase Storage (signed URL) and Printify Mockup URLs.
  - Add `download` attribute or a helper to trigger file download in the browser.

### Technical Requirements

- **API:** Admin GraphQL (Shopify), Printify API v1 (Products), Fal.ai.
- **Workflow:** Use **Inngest** for reliability and to handle long-running mockup generation.
- **Persistence:** Create `MerchantPreviews` table to track job results/status (or reuse `billable_events` pattern).
- **Cleanup:** Temp product deletion must be guaranteed (use Inngest `finally` or idempotent step).
- **State:** UI polls for job status; shows distinct states (Queued, Generating, Creating Mockups, Done, Failed with message).

### Architecture Compliance

- Services in `app/services/*`.
- UI components in the route or `app/components/*`.
- Tenant isolation (`shop_id`) enforced.

### Reference

- Fal.ai Seedream v4 Edit Docs (supports `image_size`).
- Printify API Docs (Create Product, Delete Product).
