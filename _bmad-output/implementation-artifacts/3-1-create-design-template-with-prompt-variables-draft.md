# Story 3.1: Create Design Template with Prompt Variables (Draft)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a merchant,
I want to create a design template ("Blueprint") with buyer inputs and prompt variables,
so that I can produce consistent premium outputs while letting buyers personalize some parts.

## Acceptance Criteria

1. **Given** the merchant opens “Create template”
   **When** they enter a template name, define buyer inputs (photo required; optional text toggle), and add one or more text variables (e.g., `animal`, `color`)
   **Then** the template can be saved in a **Draft** state

2. **Given** the merchant defines prompt variables
   **When** they configure the template prompt
   **Then** they can reference variables inside the prompt using `{{variable_name}}`
   **And** the system validates that all referenced variables exist

3. **Given** the merchant adds variables
   **When** they save
   **Then** variable names must be unique and non-empty (text variables only in MVP)
   **And** invalid variable definitions show clear validation errors and are not saved

4. **Given** the merchant edits an existing Draft template
   **When** they update name/inputs/variables/prompt
   **Then** changes are saved and reflected consistently in the template

## Tasks / Subtasks

- [x] Add Prisma models for draft templates and variables (AC: #1–#4)
  - [x] Add `design_templates` scoped by `shop_id` (draft-only fields in this story)
  - [x] Add `design_template_variables` (text variables only) with uniqueness per template
  - [x] Add Prisma migration under `prisma/migrations/*`
  - [x] Keep Prisma field names `snake_case` and map tables with `@@map(...)`

- [x] Add shared admin validation schema for template create/update (AC: #1–#4)
  - [x] Extend `app/schemas/admin.ts` with a new `intent` (follow existing `z.discriminatedUnion("intent", ...)` pattern)
  - [x] Use `snake_case` form fields (e.g., `template_name`, `text_input_enabled`, `prompt`, `variable_names`)
  - [x] Decide how to encode the variable list (avoid losing arrays with `Object.fromEntries(formData)`; use `formData.getAll(...)` or a single JSON field)

- [x] Implement variable reference validation (AC: #2–#3)
  - [x] Extract referenced variables from prompt using `{{variable_name}}` tokens
  - [x] Validate every referenced variable is defined
  - [x] Validate defined variables are unique and non-empty (MVP: text variables only)
  - [x] Add a small unit test for the parser/validator (co-locate `*.test.ts` next to the helper)

- [x] Add service layer for templates (routes call services; services never import routes)
  - [x] Create `app/services/templates/*.server.ts` with CRUD methods scoped by `shop_id`
  - [x] Map Prisma `snake_case` ↔ TS `camelCase` DTOs at the boundary

- [x] Add admin routes + UI for create/edit draft template (AC: #1, #4)
  - [x] Create Templates list route (empty state + "Create template")
  - [x] Create draft create route (name, inputs, variables, prompt)
  - [x] Create draft edit route (load existing; save updates)
  - [x] Follow existing embedded-app patterns:
    - preserve embedded query params via `buildEmbeddedSearch(search)` for nav links
    - return `{ error: { code, message, details? } }` for failures

- [x] Add navigation entry for Templates
  - [x] Update `app/routes/app.tsx` nav links to include Templates (preserve embedded query params)

### Review Follow-ups (AI)

- [ ] [AI-Review][Low] Add pagination to templates list route when template count exceeds 50 (app/routes/app.templates.\_index.tsx)
- [ ] [AI-Review][Low] Add search by template name to templates list (app/routes/app.templates.\_index.tsx)
- [ ] [AI-Review][Low] Add filter by status (draft/published) to templates list (app/routes/app.templates.\_index.tsx)
- [ ] [AI-Review][Low] Add sorting options (by name, status, created_at) to templates list (app/routes/app.templates.\_index.tsx)

## Dev Notes

### Developer Context (Do Not Skip)

- This story is the **first** story in Epic 3 and templates/blueprints are **not implemented yet** in the codebase; expect to add new Prisma models + new admin routes + a new service module.
- Follow established admin patterns:
  - Route `action` parses form input and validates with Zod `safeParse` from `app/schemas/admin.ts`.
  - Return errors as `{ error: { code, message, details? } }` via `data(...)` with an appropriate HTTP status.
  - Use embedded-app query preservation for links (`buildEmbeddedSearch(search)`) so navigation works inside the Shopify iframe.

### Technical Requirements (Guardrails)

- **No new server framework**: keep React Router route handlers as the HTTP surface.
- **TypeScript strict + ESM**: no weakening TS config, no `require`.
- **Naming/contracts**:
  - `snake_case` for DB fields + API/form payloads.
  - TS internal identifiers remain `camelCase`; map at boundaries.
- **Multi-tenancy**: scope every template query by `shop_id` (use `getShopIdFromSession(session)` in routes).
- **Do not break existing onboarding/paywall gates**: templates will later be part of onboarding readiness, but this story is only about creating/editing draft templates.

### UX Notes (Admin)

- Use Polaris-style patterns already used in this app (Shopify web components like `<s-page>`, `<s-section>`, banners, field-level errors).
- Validate on submit at minimum; ideally validate on blur for variable name and prompt-variable reference issues.
- Keep the experience **fast** and “draft-friendly”:
  - Save Draft works even if not publish-ready.
  - Clear inline errors for invalid variables or missing references.

### Implementation Notes / Gotchas

- **FormData arrays**: current patterns use `Object.fromEntries(await request.formData())` (see `app/routes/app.printify.tsx`). This will not preserve repeated keys for variable lists; choose a safe encoding (e.g., `formData.getAll("variable_name")` or JSON in a single field) and document it in the route.
- **Prompt variable extraction**: enforce that `{{...}}` references match defined variables; avoid a naive substring approach (handle whitespace and duplicates deterministically).
- **DB reality vs architecture target**: `prisma/schema.prisma` currently uses `provider = "sqlite"` for local dev. Add your new models following existing patterns; do not introduce manual DB changes outside Prisma migrations.

### Source Tree Touchpoints (Likely)

- DB: `prisma/schema.prisma`, `prisma/migrations/*`
- Validation: `app/schemas/admin.ts`
- Services: `app/services/templates/*.server.ts` (new), use patterns from `app/services/shops/spend-safety.server.ts`
- Routes/UI:
  - reference pattern: `app/routes/app.printify.tsx`
  - new: `app/routes/app.templates*.tsx`
- Shared helpers: `app/lib/*` (e.g., prompt-variable parsing/validation)

### Testing Standards Summary

- Prefer small unit tests for pure helpers (variable extraction/validation) and co-locate as `*.test.ts` next to the helper.
- Don’t add a new test framework; follow existing repo patterns.

### Project Structure Notes

- Routes own HTTP handling (`app/routes/*`) and call services (`app/services/*`); services must not import routes.
- Keep Prisma fields `snake_case` and map to TS `camelCase` return types from services.
- Preserve embedded app navigation params (`host`, `embedded`, `shop`, `locale`) using `buildEmbeddedSearch`.

### References

- Requirements: `_bmad-output/planning-artifacts/epics.md` (Epic 3 → Story 3.1 Acceptance Criteria)
- Architecture constraints: `_bmad-output/planning-artifacts/architecture.md` (Schemas, service boundaries, naming rules)
- UX requirements: `_bmad-output/planning-artifacts/ux-design-specification.md` (Admin patterns, draft-friendly workflow)
- Existing code patterns:
  - `app/routes/app.printify.tsx` (intent-based action + Zod `safeParse` + error envelope)
  - `app/schemas/admin.ts` (discriminated union schemas)
  - `app/lib/embedded-search.ts` (embedded query preservation)
  - `app/lib/tenancy.ts` (derive `shop_id` from session)
  - `app/services/shops/spend-safety.server.ts` (service + Prisma `snake_case` mapping)
  - `app/lib/posthog.server.ts` (PostHog capture wrapper requires `shop_id`)

## Dev Agent Record

### Agent Model Used

Antigravity (Gemini 2.5)

### Debug Log References

- TypeScript errors fixed: Replaced unsupported Shopify web component props (`fontWeight`, `multiline`) with standard HTML elements
- FormData array handling: Used JSON encoding for variable_names via `variable_names_json` field

### Completion Notes List

- Added `DesignTemplate` and `DesignTemplateVariable` Prisma models with cascade delete
- Created migration `20260114163209_add_design_templates_and_variables`
- Implemented prompt variable parsing/validation in `app/lib/prompt-variables.ts` with 22 unit tests
- Added template action schemas (create/update/delete) to `app/schemas/admin.ts` with 5000 char prompt limit
- Created templates service layer with CRUD operations in `app/services/templates/templates.server.ts`
- Added 15 integration tests for service layer covering all CRUD operations and multi-tenancy
- Added three admin routes: list, create, edit
- Fixed navigation to use React Router's `useNavigate()` instead of `window.location.href`
- Fixed variable name validation: max 50 chars, alphanumeric + underscores only, max 50 variables
- Added "Templates" navigation link to `app/routes/app.tsx`
- All 95 tests pass, TypeScript strict mode passes

### File List

- `prisma/schema.prisma` (modified)
- `prisma/migrations/20260114163209_add_design_templates_and_variables/migration.sql` (new)
- `app/lib/prompt-variables.ts` (new)
- `app/lib/prompt-variables.test.ts` (new)
- `app/schemas/admin.ts` (modified)
- `app/services/templates/templates.server.ts` (new)
- `app/services/templates/templates.server.test.ts` (new)
- `app/routes/app.templates._index.tsx` (new)
- `app/routes/app.templates.new.tsx` (new)
- `app/routes/app.templates.$templateId.tsx` (new)
- `app/routes/app.tsx` (modified)

### Change Log

- 2026-01-14: Implemented Story 3.1 - Design template CRUD with prompt variable validation
