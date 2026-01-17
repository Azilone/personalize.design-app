# Story 3.5: Publish/Unpublish Templates + Templates List (Draft/Published)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a merchant,
I want to publish or unpublish templates and manage them in a list,
so that I can control what’s available for product assignment and storefront use.

## Acceptance Criteria

1. **Given** the merchant views the templates list
   **When** templates exist
   **Then** they see each template’s name and status (`Draft` or `Published`)

2. **Given** a template is in Draft
   **When** the merchant clicks “Publish” and confirms
   **Then** the template status becomes `Published`
   **And** it becomes selectable for product assignment

3. **Given** a template is Published
   **When** the merchant clicks “Unpublish” and confirms
   **Then** the template status becomes `Draft`
   **And** it is no longer available for new product assignment

4. **Given** the merchant opens a template from the list
   **When** they edit and save
   **Then** the changes persist and the status remains unchanged unless they publish/unpublish

## Tasks / Subtasks

- [x] Build templates list view with status and actions (AC: 1-3)
  - [x] Add list view state for Draft/Published templates
  - [x] Add Publish/Unpublish actions with inline confirmation
  - [x] Persist status updates via template service
- [x] Update template edit flow to preserve status (AC: 4)
  - [x] Ensure edit form does not implicitly toggle status
  - [x] Keep status unchanged unless explicit publish/unpublish action
- [x] Validate product assignment availability (AC: 2-3)
  - [N/A] Allow only Published templates in assignment dropdown (Epic 4 - product assignment not yet implemented)
  - [N/A] Show Draft templates as disabled with helper copy (Epic 4 - product assignment not yet implemented)

## Dev Notes

- **Guardrails**: keep `snake_case` at DB/API boundaries; map to TS `camelCase` internally. Return `{ error: { code, message, details? } }` for failures. Use shared Zod schemas for admin actions. [Source: _bmad-output/project-context.md]
- **Template status rules**: only `Published` templates are selectable for product assignment (Draft must be disabled). Publish/unpublish is an explicit action, not a side effect of editing. [Source: _bmad-output/planning-artifacts/epics.md]
- **Admin UI patterns**: use Polaris patterns (resource list → detail/editor) and clear status/confirmation feedback. [Source: _bmad-output/planning-artifacts/ux-design-specification.md]
- **Service boundaries**: HTTP handling stays in `app/routes/*`; integrations and DB access in `app/services/*` (no route imports in services). [Source: _bmad-output/planning-artifacts/architecture.md]
- **Previous story context**: Story 3.4 added remove-background settings and cost breakdowns in template flows; ensure publish/unpublish does not regress those settings or cost displays. [Source: _bmad-output/implementation-artifacts/3-4-template-level-remove-background-0-025.md]
- **Testing**: co-locate unit tests next to modules; prefer unit tests for DTO mapping and status transitions; add integration tests only if needed for high-risk boundary behavior. [Source: _bmad-output/project-context.md]

### Project Structure Notes

- Admin list/edit routes live under `app/routes/app/templates` (resource list → detail/editor). [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries]
- Template persistence and DTO mapping stay in `app/services/templates/templates.server.ts`. [Source: _bmad-output/planning-artifacts/architecture.md#Architectural Boundaries]
- Shared validation schemas for admin actions live in `app/schemas/admin.ts`. [Source: _bmad-output/planning-artifacts/architecture.md#Shared Validation Schemas]
- If a new status enum or shared helper is introduced, prefer `app/lib/*` with documented conventions. [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns]

### References

- `_bmad-output/planning-artifacts/epics.md` (Epic 3 → Story 3.5 Acceptance Criteria)
- `_bmad-output/planning-artifacts/architecture.md` (Project Structure & Boundaries, API error envelope, service boundaries)
- `_bmad-output/planning-artifacts/ux-design-specification.md` (Admin resource list patterns, status/feedback guidance)
- `_bmad-output/project-context.md` (global rules, testing, naming conventions)
- `app/routes/app/templates` (templates list + edit routes)
- `app/services/templates/templates.server.ts` (template persistence + DTO mapping)
- `app/schemas/admin.ts` (admin request validation)

## Dev Agent Record

### Agent Model Used

Antigravity (Gemini)

### Debug Log References

(none required)

### Completion Notes List

- Story scaffolded from epics/architecture/ux context; publish/unpublish and list behaviors defined.
- Implemented `publishTemplate` and `unpublishTemplate` service functions with multi-tenancy and idempotency.
- Added 8 unit tests for status transitions (publish, unpublish, multi-tenancy, non-existent, idempotency).
- Added `template_publish` and `template_unpublish` Zod schemas in `admin.ts`.
- Updated templates list route with action handler and inline confirmation UI.
- Verified edit flow preserves status (updateTemplate doesn't modify status field).
- All 38 templates service tests pass.
- Product assignment filtering (AC 2-3 "selectable") deferred to Epic 4 (product assignment not yet implemented).

### Code Review Fixes Applied (2026-01-17)

**Fixed 6 HIGH and MEDIUM issues:**

1. **Added error handling for database failures** - Wrapped `publishTemplate` and `unpublishTemplate` service calls in route action handlers with try/catch, returning `{ error: { code: "internal_error", message: "Failed to publish/unpublish template" } }` with status 500. (Route action handlers)

2. **Added template completeness validation before publish** - `publishTemplate` now validates template has prompt and generation model configured before allowing publish. Throws descriptive error if validation fails. (Service function + 2 new tests)

3. **Replaced magic strings with enum constants** - Added `DRAFT_STATUS` and `PUBLISHED_STATUS` constants to use instead of hardcoded strings. (Service function)

4. **Skipped PostHog telemetry** - PostHog service not yet implemented (Epic 5). Added TODO comment for when telemetry is available.

5. **XSS issue validated** - React JSX auto-escapes template names, no vulnerability. (No fix needed)

6. **Added internal logging for observability** - Added `logger.info` calls at function entry/exit and `logger.warn` for validation failures in `publishTemplate` and `unpublishTemplate`. (Service function)

### File List

- `app/services/templates/templates.server.ts` (added `publishTemplate`, `unpublishTemplate` functions)
- `app/services/templates/templates.server.test.ts` (added 8 tests for publish/unpublish)
- `app/schemas/admin.ts` (added `templatePublishSchema`, `templateUnpublishSchema`)
- `app/routes/app/templates/_index/route.tsx` (added action handler, inline confirmation UI)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (updated status to in-progress → review)
- `_bmad-output/implementation-artifacts/3-5-publish-unpublish-templates-templates-list-draft-published.md` (this file)

## Change Log

- 2026-01-17: Implemented publish/unpublish templates with inline confirmation, service functions, and unit tests.
