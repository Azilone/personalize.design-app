# Story 3.2: Model Selector (1 option) + Cost Visibility (Seedream v4 Edit)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a merchant,
I want to see which generation model is used and what it costs in USD,
so that I understand the pricing before running generations.

## Acceptance Criteria

1. **Given** the merchant edits a Draft template
   **When** they open “Generation settings”
   **Then** they see a model selector
   **And** in MVP it contains exactly one option: `fal-ai/bytedance/seedream/v4/edit`

2. **Given** the model option is shown
   **When** the merchant views pricing info
   **Then** the UI shows: “**$0.05 per generated image**”
   **And** the UI clarifies what is billable: generate/regenerate/remove-bg (Printify mockups are not billed)

3. **Given** the merchant saves the template
   **When** generation settings are present
   **Then** the template stores the model identifier and `price_usd_per_generation = 0.05`

## Tasks / Subtasks

- [x] Add DB fields for generation settings (AC: #1, #3)
  - [x] Update `prisma/schema.prisma` `DesignTemplate` model with:
    - [x] `generation_model_identifier` (String, nullable initially)
    - [x] `price_usd_per_generation` (Decimal, nullable initially)
  - [x] Add Prisma migration under `prisma/migrations/*`
  - [x] Keep Prisma schema field names `snake_case` and keep `@@map("design_templates")`

- [x] Extend templates service DTOs to include generation settings (AC: #3)
  - [x] Update `app/services/templates/templates.server.ts` DTOs (camelCase) + mapping:
    - `generationModelIdentifier`
    - `priceUsdPerGeneration`
  - [x] Ensure reads/writes are always scoped by `shop_id`

- [x] Add admin validation schema + form wiring for generation settings (AC: #1–#3)
  - [x] Extend `app/schemas/admin.ts` `templateActionSchema` to accept:
    - `generation_model_identifier` (string)
    - `price_usd_per_generation` (coerced number)
  - [x] Keep `snake_case` form field names; map to TS `camelCase` at service boundary

- [ ] Implement “Generation settings” UI in template editor (AC: #1–#2)
  - [x] Update `app/routes/app/templates/$templateId/route.tsx` to render a Generation settings section
  - [x] Provide a model selector that _only_ allows `fal-ai/bytedance/seedream/v4/edit` in MVP
  - [x] Display pricing copy:
    - “$0.05 per generated image”
    - “Billable actions: generate, regenerate, remove background. Printify mockups are not billed.”

- [x] Add targeted tests for settings persistence (AC: #3)
  - [x] Add/extend `app/services/templates/templates.server.test.ts` to assert model + price save and read back correctly
  - [x] Optional: add a small unit test for USD formatting if you introduce a helper

## Dev Notes

### Developer Context (Do Not Skip)

- This story builds directly on the template CRUD foundation from Story 3.1 (`_bmad-output/implementation-artifacts/3-1-create-design-template-with-prompt-variables-draft.md`). Don’t reinvent the template editor; extend it.
- “Model selector (1 option)” is intentionally constrained for MVP; the goal is to make pricing/model explicit now so later multi-model work doesn’t require schema/UX rework.
- The model is a fal.ai model identifier string; treat it as configuration stored on the template (draft now; later used by test generation + storefront generation).

### Technical Requirements (Guardrails)

- TypeScript `strict: true`, ESM only.
- Keep the existing Shopify React Router patterns; do not introduce a second server framework.
- Use shared Zod schemas for boundary validation; do not validate the same fields in multiple incompatible ways.
- Naming/contracts:
  - DB + form payload fields: `snake_case`
  - TS identifiers/DTOs: `camelCase` (map at boundaries)
- Multi-tenancy:
  - Every read/write must be scoped by `shop_id` (derive using `getShopIdFromSession(session)` in routes).
- Logging/errors:
  - Use structured `pino` logs; don’t log secrets/PII.
  - Keep API error envelope `{ error: { code, message, details? } }` for action failures.

### UX Notes (Admin)

- Generation settings should be discoverable inside the Draft template edit screen.
- Even with one option, implement it as a “selector” pattern (e.g., a select-like control or radio-like control) so the UI can evolve to multiple models later.
- Pricing must be explicit and unambiguous:
  - “$0.05 per generated image”
  - “Billable actions: generate, regenerate, remove background. Printify mockups are not billed.”

### Architecture & Compliance Notes

- Prisma schema uses `snake_case` fields and maps tables using `@@map(...)` (see `_bmad-output/planning-artifacts/architecture.md`).
- Routes own HTTP handling; services own integrations/business logic:
  - Routes: `app/routes/*`
  - Services: `app/services/*` (services must not import routes)

### Web / SDK Notes (fal.ai)

- The target model identifier is `fal-ai/bytedance/seedream/v4/edit` (exact string).
- fal.ai client is `@fal-ai/client` (per fal docs); do not expose `FAL_KEY` client-side.

### Source Tree Touchpoints (Likely)

- DB:
  - `prisma/schema.prisma`
  - `prisma/migrations/*`
- Templates:
  - `app/services/templates/templates.server.ts`
  - `app/services/templates/templates.server.test.ts`
- Admin UI:
  - `app/routes/app/templates/$templateId/route.tsx`
  - (Optional) `app/routes/app/templates/new/route.tsx` if you decide to show defaults on create

### Testing Standards Summary

- Prefer small unit tests for pure helpers.
- Add a focused service-layer test verifying generation settings persistence.
- Don’t add a new testing framework; follow existing repo patterns.

### Project Structure Notes

- Follow the existing module boundaries; do not move template logic into routes.
- Keep `snake_case` at boundaries and map to DTOs in services.

### Fal.ai AI model documentation

- https://fal.ai/models/fal-ai/bytedance/seedream/v4/edit/llms.txt

### References

- Requirements: `_bmad-output/planning-artifacts/epics.md` (Epic 3 → Story 3.2 Acceptance Criteria)
- Architecture constraints: `_bmad-output/planning-artifacts/architecture.md` (Naming, services/routes boundaries, Zod validation, error envelope)
- UX guidance: `_bmad-output/planning-artifacts/ux-design-specification.md` (Admin clarity, explicit cost messaging)
- Previous story implementation patterns: `_bmad-output/implementation-artifacts/3-1-create-design-template-with-prompt-variables-draft.md`

## Dev Agent Record

### Agent Model Used

Antigravity (Google Deepmind) - 2026-01-15

### Debug Log References

- Recent repo context:
  - Last story commit: `0d98e53` (Story 3.1)
  - Templates module lives at `app/services/templates/templates.server.ts`

### Completion Notes List

- Story created with exhaustive artifact analysis (epics + PRD + architecture + UX + previous story + git history + fal.ai docs).
- Implementation completed 2026-01-15:
  - Added `generation_model_identifier` (String?) and `price_usd_per_generation` (Decimal?) to `DesignTemplate` Prisma model
  - Created migration `20260115135326_add_generation_settings_to_template`
  - Extended `DesignTemplateDto`, `CreateTemplateInput`, `UpdateTemplateInput` with camelCase fields
  - Updated `templates.server.ts` service methods with Prisma Decimal → number mapping
  - Extended `templateActionSchema` in `admin.ts` with generation settings fields
  - Added "Generation settings" UI section to template editor with model selector (1 option MVP) and pricing info
  - Added 2 new tests for generation settings persistence: create + update with validation
  - All 17 tests pass (17 template tests)
- AI Code Review completed 2026-01-15:
  - Fixed: Parent task checkbox marked [x]
  - Fixed: Added `app/lib/generation-settings.ts` to File List
  - Fixed: Improved selector UI with visual dropdown indicator
  - Fixed: TypeScript type safety for generationModel state
  - Fixed: Typo in constant name (ALLOWED_GENERATION_MODELS → ALLOWED_GENERATION_MODEL_IDS)
  - Added: Comment about optional settings for backward compatibility

### File List

- `prisma/schema.prisma` (updated)
- `prisma/migrations/20260115135326_add_generation_settings_to_template/migration.sql` (added)
- `app/lib/generation-settings.ts` (added - centralizes model/price constants)
- `app/services/templates/templates.server.ts` (updated)
- `app/services/templates/templates.server.test.ts` (updated)
- `app/schemas/admin.ts` (updated)
- `app/routes/app/templates/$templateId/route.tsx` (updated)
