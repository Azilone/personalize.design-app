# Story 3.3: Test Generate (1–4) + Results Gallery (Cost + Time)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a merchant,
I want to test-generate multiple outputs for a template and see cost/time per output,
so that I can validate quality before publishing.

## Acceptance Criteria

1. **Given** the merchant is viewing a Draft template
   **When** they open the "Test" section
   **Then** they can upload/select a test photo input
   **And** they can optionally enter test text (only if the template has text input enabled)
   **And** they can set "Number of images" from **1 to 4**

2. **Given** the merchant selects `N` images (1–4)
   **When** the UI shows the estimated cost
   **Then** it displays estimated cost in USD (e.g., `$0.05 × N`) clearly before running

3. **Given** the merchant starts test generation
   **When** generation is running
   **Then** the UI shows a progress state
   **And** on completion it shows a results gallery of the generated images

4. **Given** results are displayed
   **When** the merchant views each generated image
   **Then** the UI shows per-image generation metadata including:
   - generation time (seconds)
   - cost (USD)

5. **Given** the generation fails (timeout/provider error)
   **When** the UI shows the error
   **Then** it provides a deterministic recovery action ("Try again")
   **And** it does not publish the template automatically

## Tasks / Subtasks

- [ ] Create fal.ai integration with file-per-model architecture (AC: #3, #4)
  - [ ] Add `app/services/fal/client.server.ts` - shared fal.ai HTTP client wrapper
  - [ ] Add `app/services/fal/types.ts` - shared types/interfaces for all models:
    - `GenerationInput` (image_url, prompt, model-specific options)
    - `GenerationOutput` (images[], timings, metadata)
    - `ModelAdapter` interface (generate method, config)
  - [ ] Add `app/services/fal/models/seedream-v4-edit.ts` - Seedream v4 Edit adapter file:
    - Implements `ModelAdapter` interface
    - Model-specific request/response mapping
    - Model-specific validation and defaults
  - [ ] Add `app/services/fal/registry.ts` - model registry:
    - Maps model IDs to their adapter modules
    - `getModelAdapter(modelId)` lookup function
    - Validates model ID exists before generation
  - [ ] Add `app/services/fal/generate.server.ts` - unified generation entry point:
    - Loads adapter from registry based on `generation_model_identifier`
    - Delegates to model-specific adapter
    - Returns standardized `GenerationOutput`
  - [ ] Add error handling for timeout, provider errors, network failures
  - [ ] Return structured result with timing metadata (e.g., `inference_time` from fal responses)

- [ ] Create file upload infrastructure for test photos (AC: #1)
  - [ ] Add `app/services/supabase/storage.ts` for Supabase Storage signed URL uploads
  - [ ] Implement temporary test-photo upload to private bucket with time-limited signed URLs
  - [ ] Add validation for allowed file types: `jpeg`, `jpg`, `png`, `heic`, `avif`, `webp`
  - [ ] Return signed URL for read access (for fal.ai to consume)

- [ ] Add test generation action to template route (AC: #1–#5)
  - [ ] Extend `app/schemas/admin.ts` with `template_test_generate` intent schema:
    - `intent: "template_test_generate"`
    - `template_id: string`
    - `test_photo_url: string` (signed URL)
    - `test_text?: string` (optional, only when template has text input enabled)
    - `num_images: number` (1–4, coerced integer)
  - [ ] Add action handler in `app/routes/app/templates/$templateId/route.tsx`:
    - Validate template exists and is in Draft status
    - Call fal.ai generation service for each requested image
    - Return array of results with per-image metadata (timing, cost)
    - Handle errors gracefully with deterministic retry support

- [ ] Implement Test Panel UI (AC: #1–#5)
  - [ ] Add "Test" section to template edit page below Generation settings
  - [ ] Add photo upload input (drag-drop or file picker)
  - [ ] Show upload preview immediately after selection
  - [ ] Conditionally show text input field (only if `textInputEnabled` is true on template)
  - [ ] Add "Number of images" selector (1–4) with visual indicator
  - [ ] Display estimated cost: `$<price> × <N> = $<total>` before generation
  - [ ] Add "Generate" primary CTA
  - [ ] Implement progress/loading state during generation
  - [ ] Implement results gallery (grid of generated images)
  - [ ] For each image, display:
    - Generated image (thumbnail + click-to-enlarge)
    - Generation time (e.g., "3.2s")
    - Cost (e.g., "$0.05")
  - [ ] Implement error state with "Try again" button
  - [ ] Add quality feedback (thumbs up/down) per image (nice-to-have, see FR8)

- [ ] Add tests for test generation flow (AC: #3–#5)
  - [ ] Add unit tests for fal.ai client error handling
  - [ ] Add integration test for test generation action (mock fal.ai)
  - [ ] Verify that estimated cost calculation is correct for 1–4 images

## Dev Notes

### Developer Context (Do Not Skip)

- This story builds on Story 3.1 (template CRUD) and Story 3.2 (model + cost visibility). The template already stores `generation_model_identifier` and `price_usd_per_generation`.
- The test generation flow is the merchant's first real interaction with the AI model. UX must feel fast and premium.
- **Critical**: This is a test/preview flow only. It does NOT affect billing yet (MVP: test generations consume spend safety budget, but billing ledger is **not** implemented until Epic 5).
- Use the existing constants from `app/lib/generation-settings.ts` for model ID and price.

### Previous Story Intelligence (3-2)

From Story 3.2 implementation:
- `generation_model_identifier` and `price_usd_per_generation` are stored on `DesignTemplate` and mapped via DTOs
- `MVP_GENERATION_MODEL_ID = "fal-ai/bytedance/seedream/v4/edit"` is the only allowed model
- `MVP_PRICE_USD_PER_GENERATION = 0.05` is the base cost per image
- The template edit page already has Generation settings section with model selector and pricing info
- Service boundary: routes handle HTTP, services handle business logic

### Technical Requirements (Guardrails)

- **TypeScript strict mode**: All code must compile with `strict: true`
- **ESM only**: Use `import`/`export`, no `require()`
- **Naming conventions**:
  - DB + API payloads: `snake_case`
  - TS identifiers/DTOs: `camelCase` (map at boundaries)
  - Form field names: `snake_case` for HTML, mapped to camelCase in handlers
- **Multi-tenancy**: Every read/write must be scoped by `shop_id` (derive using `getShopIdFromSession(session)`)
- **Error envelope**: Use `{ error: { code, message, details? } }` for all action failures
- **Logging**: Use structured `pino` logs; never log secrets/PII
- **Secrets**: All fal.ai credentials (`FAL_KEY`) via env vars; never client-side

### fal.ai Integration Notes

**Model endpoint**: `fal-ai/bytedance/seedream/v4/edit`

**API client**: Use `@fal-ai/client` npm package (already in project dependencies or add it)

**Request shape** (from fal.ai docs):
```typescript
{
  image_url: string; // URL to input photo
  prompt: string;    // The full rendered prompt from template
  // Optional params for control (check llms.txt for full list)
}
```

**Response shape** includes:
- `images[]` array with `url` and potentially other metadata
- `timings` object with `inference` time in seconds (or similar metric)

**Error handling**:
- Network errors → retry-able
- Timeout (>30s) → show "Try again"
- Provider 4xx/5xx → show "Try again" with generic message
- Never expose internal error details to merchant

**Reference**: [fal.ai Seedream v4 Edit llms.txt](https://fal.ai/models/fal-ai/bytedance/seedream/v4/edit/llms.txt)

### Supabase Storage Notes

**Bucket**: Create/use a private bucket for test uploads (e.g., `test-uploads` or `tmp-uploads`)

**Signed URLs**:
- Upload: generate a signed PUT URL for the client to upload directly
- Read: generate a signed GET URL with short expiry (e.g., 30 minutes) for fal.ai to fetch

**File validation**:
- Allowed types: `jpeg`, `jpg`, `png`, `heic`, `avif`, `webp`
- Max file size: consider 10MB limit for MVP (check fal.ai limits if any)

### UX Notes (Admin)

**From UX Design Spec (TemplateTestPanel component)**:
- **Purpose**: Generate test outputs and validate "artist-made" quality bar
- **Anatomy**: upload input, generate button, progress/skeleton, result gallery, thumbs up/down
- **States**: idle, uploading, generating, success, failure (Try again)
- **Behavior**: deterministic retry; shows clear error messaging

**Loading/progress patterns**:
- Use progress + short status text (not spinner-only), e.g., "Generating preview…"
- Prefer skeletons for preview areas to maintain layout stability
- Show estimated time if available

**Result display**:
- Generation time should be displayed in seconds (e.g., "3.2s")
- Cost should be displayed in USD (e.g., "$0.05")
- Gallery layout: grid for multiple images; larger view on click/tap

**Error UX**:
- Calm, trust-preserving copy: "Something went wrong. Try again."
- Single deterministic action: "Try again" button
- Optional: technical details for debugging (collapsed/hidden)

### Architecture & File Structure

**File-per-model pattern**: Each AI model gets its own adapter file for extensibility. When adding new models post-MVP, simply add a new adapter file and register it.

**New files to create**:
```
app/services/fal/
├── client.server.ts              # Shared fal.ai HTTP client wrapper
├── types.ts                      # Shared interfaces (ModelAdapter, GenerationInput/Output)
├── registry.ts                   # Model registry - maps IDs to adapters
├── generate.server.ts            # Unified generation entry point
└── models/
    └── seedream-v4-edit.ts       # Seedream v4 Edit model adapter

app/services/supabase/
├── client.server.ts              # (may exist) Supabase client
└── storage.ts                    # Upload/signed URL logic for test photos
```

**Model adapter pattern** (each model file implements):
```typescript
// app/services/fal/types.ts
export interface ModelAdapter {
  modelId: string;
  displayName: string;
  generate(input: GenerationInput): Promise<GenerationOutput>;
}

// app/services/fal/models/seedream-v4-edit.ts
export const seedreamV4EditAdapter: ModelAdapter = {
  modelId: 'fal-ai/bytedance/seedream/v4/edit',
  displayName: 'Seedream v4 Edit',
  async generate(input) { /* model-specific logic */ }
};
```

**Adding new models post-MVP**:
1. Create `app/services/fal/models/<new-model>.ts` implementing `ModelAdapter`
2. Register in `app/services/fal/registry.ts`
3. Add to `ALLOWED_GENERATION_MODEL_IDS` in `app/lib/generation-settings.ts`

**Files to modify**:
- `app/schemas/admin.ts` - add `template_test_generate` intent
- `app/routes/app/templates/$templateId/route.tsx` - add test section UI + action handler

**Routes own HTTP handling; services own integrations**:
- Route handles request validation, auth, and response formatting
- Service handles fal.ai API calls, Supabase storage, and error mapping

### Cost Calculation Logic

```typescript
// From generation-settings.ts
const basePrice = template.priceUsdPerGeneration ?? MVP_PRICE_USD_PER_GENERATION;

// Estimated cost before generation
const estimatedCost = basePrice * numImages;

// Actual cost per image (after generation)
// Each successful generation = basePrice
// Failed generations = $0 (not charged)
```

### Testing Standards Summary

- **Unit tests**: Small tests for pure helpers (cost calculation, file type validation)
- **Integration tests**: Mock fal.ai responses and test the action handler
- **Co-location**: Place `*.test.ts` files next to the module under test
- **No new testing framework**: Follow existing repo patterns (Vitest if available)

### Project Structure Notes

- Follow the existing module boundaries in `app/services/*`
- Keep `snake_case` at API boundaries and map to DTOs in services
- The fal.ai client should be server-only (`.server.ts` suffix)

### Git Intelligence (Recent Commits)

Recent commit patterns from Story 3.2:
- `feat:` prefix for new feature commits
- Migrations go in `prisma/migrations/`
- Constants centralized in `app/lib/`
- Tests co-located in same directory as source

### References

- Requirements: `_bmad-output/planning-artifacts/epics.md` (Epic 3 → Story 3.3 Acceptance Criteria)
- Architecture constraints: `_bmad-output/planning-artifacts/architecture.md` (fal.ai integration, Supabase Storage, naming conventions)
- UX guidance: `_bmad-output/planning-artifacts/ux-design-specification.md` (TemplateTestPanel, loading states, error handling)
- Previous story: `_bmad-output/implementation-artifacts/3-2-model-selector-1-option-cost-visibility-seedream-v4-edit.md`
- Project context: `_bmad-output/project-context.md`
- Generation settings: `app/lib/generation-settings.ts`
- fal.ai docs: https://fal.ai/models/fal-ai/bytedance/seedream/v4/edit/llms.txt

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

- Previous story context:
  - Story 3.2 completed: generation settings stored on templates
  - Templates module: `app/services/templates/templates.server.ts`
  - Generation constants: `app/lib/generation-settings.ts`

### Completion Notes List

- Story created with exhaustive artifact analysis (epics + architecture + UX + previous story 3-2 + project context)
- Ready for developer implementation
- Note: Billing ledger/usage tracking is NOT in scope for this story (see Epic 5)

### File List

<!-- Files will be added during implementation -->
