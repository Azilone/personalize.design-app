# Story 4.2: Assign Single Template to Product + Explicit Enable (MVP)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a merchant,
I want to assign one published template to a product and explicitly enable personalization,
so that I control exactly when a product becomes personalizable.

## Acceptance Criteria

1. Given the merchant is on a product configuration view, when they view template assignment, then they can select exactly one Published template to assign (MVP constraint) and the UI shows a disabled “Multiple templates” control labeled Coming soon.
2. Given no template is assigned, when the merchant views product personalization status, then personalization is Disabled and enabling is not allowed until a template is assigned.
3. Given the merchant assigns a template, when they save, then the assignment is stored for that product and personalization remains Disabled until the merchant explicitly enables it.
4. Given a template is assigned, when the merchant toggles “Enable personalization for this product” ON and saves, then the product-level personalization setting becomes enabled.
5. Given the merchant unassigns the template, when they save, then personalization is automatically set to Disabled for that product.

## Tasks / Subtasks

- [x] Add product-template assignment persistence (AC: 1-5)
  - [x] Add Prisma model for product assignment with `shop_id`, `product_id`, `template_id`, `personalization_enabled`, timestamps (snake_case fields + migration)
  - [x] Enforce unique assignment per product per shop (unique index on `shop_id`, `product_id`)
- [x] Build product configuration UI for assignment + enable toggle (AC: 1-5)
  - [x] Update `app/routes/app/products/$productId/route.tsx` to load product, assigned template, and published templates list
  - [x] Render single-template selector (published only) and disabled "Multiple templates (Coming soon)" control
  - [x] Render enable toggle disabled until a template is assigned
  - [x] Save action persists assignment + enable state; unassign clears assignment and forces disable
- [x] Add service layer + validation (AC: 1-5)
  - [x] Add `app/services/products/product-template-assignment.server.ts` for CRUD operations (shop scoped)
  - [x] Update `app/schemas/admin.ts` with Zod schema for assignment action payloads
  - [x] Add PostHog events `product_template.assignment_saved` and `product_template.personalization_enabled` with `shop_id`, `product_id`, `template_id`
- [x] Error handling + feedback (AC: 1-5)
  - [x] Use `{ error: { code, message, details? } }` for action errors
  - [x] Add Polaris feedback for save/validation errors and success confirmation
- [ ] [AI-Review][HIGH] Fix dev bypass security issue - Add secret header check + additional restriction (localhost/VPN/admin-session) to paywall dev bypass
- [ ] [AI-Review][HIGH] Document all changed files in story File List (11 undocumented files found)
- [ ] [AI-Review][HIGH] Add proper safeguards for dev bypass in production (hard-fail if NODE_ENV != 'development')
- [ ] [AI-Review][MEDIUM] Move unrelated code changes to separate commits with clear messages

## Dev Notes

- This story builds on Story 4.1 product sync/listing and the product config route placeholder.
- MVP constraint: exactly one published template per product; multi-template UI exists but disabled and labeled “Coming soon”.
- Enabling personalization is an explicit action and must remain disabled until a template is assigned.
- Unassigning a template must forcibly disable personalization to avoid orphaned storefront state.
- Keep admin-only; do not add storefront/App Proxy routes here.

### Technical Requirements

- Shopify Admin API is GraphQL-only and already used for product sync; do not add client-side Admin API calls.
- Use shared Zod schemas for the assignment action; payloads are `snake_case` at the boundary and mapped to `camelCase` internally.
- Prisma schema fields remain `snake_case`; add a migration for the assignment table.
- Log via pino JSON to stdout; emit PostHog events with `snake_case` properties and correlation keys (`shop_id`, `product_id`, `template_id`).
- Return errors using the standard envelope `{ error: { code, message, details? } }`.

### Architecture Compliance

- Route handlers live in `app/routes/*` and call services; services must not import routes.
- Strict tenant scoping: all assignment reads/writes keyed by `shop_id`.
- Keep within React Router app template; no new server framework.

### Library & Framework Requirements

- React 18 + react-router ^7.12.0 with Shopify React Router template.
- Admin UI uses Polaris web components (not `@shopify/polaris`).
- Prisma ^6.16.3 for persistence; TypeScript `strict: true`, ESM-only.

### File Structure Requirements

- Routes:
  - `app/routes/app/products/$productId/route.tsx` for assignment UI + action
- Services:
  - `app/services/products/product-template-assignment.server.ts`
  - Reuse existing template list service/query if available (do not duplicate Shopify auth)
- Schemas:
  - `app/schemas/admin.ts` add product assignment action schema
- DB:
  - New table, e.g. `product_template_assignments` with `shop_id`, `product_id`, `template_id`, `personalization_enabled`, `created_at`, `updated_at`

### Testing Requirements

- Only add tests if introducing pure mapping logic; co-locate `*.test.ts` near the module.
- Prioritize schema validation and any mapping helpers.

### Project Structure Notes

- Align with existing product sync data in `shop_products` and template storage in `design_templates`.
- Keep route/service boundaries from architecture doc; no changes to storefront bundle paths.

### References

- Epic 4 story 4.2 acceptance criteria. [Source: `_bmad-output/planning-artifacts/epics.md`]
- Product config route and product sync context. [Source: `_bmad-output/implementation-artifacts/4-1-sync-shopify-products-select-product-to-configure.md`]
- Architecture decisions and project structure. [Source: `_bmad-output/planning-artifacts/architecture.md`]
- UX admin patterns (resource list/detail, feedback). [Source: `_bmad-output/planning-artifacts/ux-design-specification.md`]
- Project rules and conventions. [Source: `_bmad-output/project-context.md`]

## Dev Agent Record

### Agent Model Used

gpt-4.1

### Debug Log References

- `pnpm test`
- `pnpm lint`

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Added assignment services, published template listing, and admin schema validation for product template configuration.
- Built product configuration UI with single-template assignment, enable toggle gating, and feedback banners.
- Added PostHog telemetry for assignment saves and personalization enablement.
- Added unit coverage for assignment record mapping.

### File List

- app/routes/app/products/$productId/route.tsx
- app/routes/app/products/\_index/route.tsx
- app/schemas/admin.ts
- app/services/products/product-template-assignment.server.ts
- app/services/products/product-template-assignment.server.test.ts
- app/services/templates/templates.server.ts

### Change Log

- 2026-01-21: Added product template assignment persistence, UI configuration, validation, and telemetry.
