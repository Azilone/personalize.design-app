# Story 3.4: Template-Level Remove Background ($0.025)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a merchant,
I want to enable remove background for a template,
so that uploaded photos are cleaned automatically before generation.

## Acceptance Criteria

1. **Given** the merchant edits a Draft template
   **When** they enable the "Remove Background" checkbox
   **Then** the setting is saved on the template as enabled

2. **Given** "Remove Background" is enabled on the template
   **When** the UI displays pricing for a generation run
   **Then** the estimated cost includes the tool cost: `+ $0.025` (per image where applied)
   **And** total is shown as: `(generation_cost_usd × N) + (remove_bg_cost_usd × N)`

3. **Given** the merchant runs test generation for `N` images
   **When** Remove Background is enabled
   **Then** the system applies background removal to the input photo before generation
   **And** the per-image metadata includes tool usage and total cost

## Tasks / Subtasks

- [x] Add remove background flag to template model and DTOs (AC: 1)
  - [x] Update Prisma schema field (snake_case) and migration
  - [x] Extend template DTO mapping to include `remove_background_enabled`
  - [x] Update admin Zod schema to accept `remove_background_enabled`
- [x] Update admin template settings UI to toggle remove background (AC: 1)
  - [x] Add checkbox to generation settings
  - [x] Save to template on update
- [x] Update test generation cost calculation and metadata (AC: 2, 3)
  - [x] Add `REMOVE_BG_PRICE_USD = 0.025` constant in `app/lib/generation-settings.ts`
  - [x] Update estimated cost display to include remove-bg
  - [x] Persist tool usage/cost per image in `template_test_generation`
- [x] Apply remove background in fal.ai generation flow (AC: 3)
  - [x] Add BiRefNet v2 step before Seedream generation
  - [x] Pass background-removed asset URL to Seedream (via fal.ai temporary URL)
  - [x] Use preprocessing step with cost/time tracking
- [x] Tests (AC: 1-3)
  - [x] Unit tests for removeBackgroundEnabled in templates service
  - [x] All 153 tests pass (28 in templates service)

## Dev Notes

- **Guardrails**: keep `snake_case` at DB/API boundaries; map to `camelCase` in TS DTOs. Use shared Zod schemas for admin actions. Use error envelope `{ error: { code, message, details? } }` for failures. [Source: _bmad-output/project-context.md]
- **Billing safety**: Remove background is billable as a tool usage; do not create billable events yet (Epic 5). Still surface cost in UI. [Source: _bmad-output/planning-artifacts/architecture.md#Billing Safety (Usage Charges) & Idempotency]
- **Storefront unaffected**: This story is admin + test generation only. Storefront flow will read template setting later (Epic 6). [Source: _bmad-output/planning-artifacts/epics.md]
- **Inngest**: Deferred to Epic 6 storefront flow. Test generation uses inline preprocessing for MVP. [Source: _bmad-output/planning-artifacts/architecture.md#Async Orchestration]
- **Source tree**: template update flows live in `app/routes/app/templates/$templateId/route.tsx` and template services in `app/services/templates/templates.server.ts`. [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries]
- **Testing**: co-locate tests next to modules. Target unit tests for cost helpers + integration test for action handler. [Source: _bmad-output/project-context.md#Testing Rules]

### Project Structure Notes

- Keep server handling in `app/routes/*` and integration logic in `app/services/*` (no route imports in services). [Source: _bmad-output/planning-artifacts/architecture.md#Architectural Boundaries]
- Store shared validation in `app/schemas/*`, especially admin intent schemas. [Source: _bmad-output/planning-artifacts/architecture.md#Shared Validation Schemas]
- Extend `app/lib/generation-settings.ts` for model + pricing constants. [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns]

### References

- `_bmad-output/planning-artifacts/epics.md` (Epic 3 → Story 3.4 Acceptance Criteria)
- `_bmad-output/planning-artifacts/architecture.md` (Fal.ai integration, storage, error envelope, naming conventions)
- `_bmad-output/planning-artifacts/ux-design-specification.md` (TemplateTestPanel UX guidance)
- `_bmad-output/project-context.md` (global rules + versions)
- `app/lib/generation-settings.ts` (model + pricing constants)
- `app/routes/app/templates/$templateId/route.tsx` (template update + test generation)
- `app/services/templates/templates.server.ts` (template DTOs + persistence)
- `app/services/fal/generate.server.ts` (generation pipeline)

## Dev Agent Record

### Agent Model Used

Antigravity (Gemini)

### Debug Log References

### Completion Notes List

- Added `remove_background_enabled` Boolean field to DesignTemplate model with migration
- Extended `DesignTemplateDto`, `CreateTemplateInput`, and `UpdateTemplateInput` with `removeBackgroundEnabled`
- Updated admin Zod schema with `remove_background_enabled` validation for template create/update
- Added "Remove background from photos" checkbox in Generation Settings UI
- Added `REMOVE_BG_PRICE_USD = 0.025` constant to generation-settings.ts
- Updated cost display to show breakdown: Generation cost + Remove Background cost
- Created BiRefNet v2 module at `app/services/fal/models/birefnet-v2.ts`
- Modified `generateImages` to optionally apply background removal preprocessing
- **Fixed AC #3 compliance:** Per-image metadata now includes `generationCostUsd` and `removeBgCostUsd` breakdown
- **Fixed audit trail:** Extended `TemplateTestGeneration` model and `recordTestGeneration` function to track separate costs
- **Added integration tests:** 3 new tests verify remove-bg preprocessing, cost distribution, and error handling
- **Added specific error handling:** `remove_bg_failed` error code with UI-specific guidance
- **Fixed floating-point precision:** Cost distribution now uses `toFixed(3)` for clean values
- All 156 tests pass

### File List

- prisma/schema.prisma (modified: added remove_background_enabled field)
- prisma/migrations/20260117104604_add_remove_background_enabled/migration.sql (new)
- prisma/migrations/20260117110622_add_remove_bg_cost_breakdown/migration.sql (new: cost breakdown fields)
- app/services/templates/templates.server.ts (modified: added removeBackgroundEnabled to DTOs and cost breakdown tracking)
- app/services/templates/templates.server.test.ts (modified: added removeBackgroundEnabled tests)
- app/schemas/admin.ts (modified: added remove_background_enabled to Zod schemas)
- app/lib/generation-settings.ts (modified: added REMOVE_BG_PRICE_USD constant)
- app/routes/app/templates/$templateId/route.tsx (modified: added checkbox, state, cost display, action handler, error handling)
- app/services/fal/models/birefnet-v2.ts (new: BiRefNet v2 background removal module)
- app/services/fal/generate.server.ts (modified: added removeBackgroundEnabled option and preprocessing, cost breakdown)
- app/services/fal/types.ts (modified: extended GeneratedImage with cost breakdown fields, added remove_bg_failed error code)
- app/services/fal/generate.server.test.ts (modified: added integration tests for remove-bg flow)

## Change Log

- 2026-01-17: Story 3.4 implementation complete. All AC satisfied and tests passing.
- 2026-01-17: Code review fixes applied - extended GeneratedImage type with cost breakdown, added audit trail for remove-bg costs, added integration tests, improved error handling, fixed UI issues. All 156 tests passing.
