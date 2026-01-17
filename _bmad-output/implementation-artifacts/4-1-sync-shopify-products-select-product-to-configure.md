# Story 4.1: Sync Shopify Products + Select Product to Configure

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a merchant,
I want to sync and select a Shopify product from my existing catalog,
so that I can configure personalization without creating listings in the app.

## Acceptance Criteria

1. Given the merchant opens the Products page, when they click “Sync products”, then the app fetches products from Shopify and displays them in a list.
2. Given products are listed, when the merchant selects a product, then they enter a product configuration view for that product.
3. Given products are listed, the UI clearly indicates which products are Printify-synced using our internal mapping and/or metafields.
4. Given the merchant returns later, when products have already been synced, then the list loads without requiring a manual re-sync (but re-sync is available).

## Tasks / Subtasks

- [ ] Build Shopify product sync flow (AC: 1)
  - [ ] Add admin GraphQL query to list products with pagination and basic fields (id, title, handle, featured image)
  - [ ] Create service module for product sync/listing (shop scoped, no new framework)
  - [ ] Store last sync timestamp per shop (or product cache metadata) to avoid unnecessary re-syncs
- [ ] Create Products list UI (AC: 1, 3, 4)
  - [ ] Add Products route and Polaris UI list/table with sync and re-sync actions
  - [ ] Persist list in DB so page loads without re-sync
  - [ ] Show loading/error states using standard error envelope
  - [ ] Surface Printify-synced indicator using mapping + metafields
- [ ] Implement product selection flow (AC: 2)
  - [ ] Add Product configuration route (detail view placeholder for story 4.2)
  - [ ] Wire selection to navigate with embedded app search params

## Developer Context

- Product setup flows are part of Epic 4; the next stories will assign templates and enable personalization, so this story should only set up sync and navigation.
- Printify identification must be robust: use app-owned DB mapping as the source of truth; use product metafields for redundancy and admin visibility.
- Do not introduce storefront/App Proxy routes here; this is admin-only.
- Reuse existing Shopify and Printify integration utilities; do not duplicate token handling or HMAC logic already present in `app/shopify.server.ts` and `app/services/printify/*`.
- Completion must include: product list renders from persisted DB data, sync action updates list, and selection navigates to product configuration route with correct id.

## Technical Requirements

- Shopify Admin API usage is GraphQL-only; use `products` query with `first` + `after` pagination and `pageInfo` cursors.
- Detect Printify products via DB mapping (source of truth) and optionally read metafields: `personalize_design.printify_product_id`, `personalize_design.printify_shop_id`.
- Use shared Zod schemas for form/actions; keep payloads `snake_case` at boundaries and map to `camelCase` internally.
- Return errors as `{ error: { code, message, details? } }`.
- Log via pino JSON to stdout; emit PostHog events with `snake_case` props and correlation keys including `shop_id`.
- Prisma schema uses `snake_case` fields; any new tables must be added via Prisma migrations.
- Avoid regressions: do not change existing template/test-generation flows, Printify integration screens, or onboarding routes.

## Architecture Compliance

- Route handlers live in `app/routes/*` and call services; services must not import routes.
- Shopify Admin API calls must use server-side `authenticate.admin` (no client-side API usage).
- Strict tenant scoping required: all data keyed by `shop_id`.
- Follow React Router app patterns; do not add a parallel REST server.

## Library & Framework Requirements

- React 18 + react-router ^7.12.0 with Shopify React Router template.
- Admin UI uses Polaris web components (not `@shopify/polaris`).
- Prisma ^6.16.3 for persistence.
- TypeScript `strict: true`, ESM-only.

## File Structure Requirements

- Routes:
  - `app/routes/app/products/_index/route.tsx` for list + sync action.
  - `app/routes/app/products/$productId/route.tsx` for product selection/config placeholder.
- Services:
  - `app/services/shopify/products.server.ts` for Admin API query.
  - `app/services/products/product-sync.server.ts` for persistence + mapping logic.
- Schemas:
  - `app/schemas/admin.ts` add product sync action schema.
- DB:
  - `shop_products` table with `shop_id`, `product_id`, `title`, `handle`, `image_url`, `synced_at`, `printify_product_id`, `printify_shop_id` (`snake_case`).

## Testing Requirements

- Only add tests if introducing pure mapping logic; co-locate `*.test.ts` next to the module.
- Keep test scope small (schema validation, mapping helpers) and follow existing patterns.

## UX Requirements (Admin)

- Follow Polaris resource list/detail pattern; clear empty state when no products synced.
- Sync action shows loading and completion feedback (banner/toast). Re-sync is available even when list already exists.
- Product rows show an explicit Printify badge/label when mapped; non-Printify products remain selectable but clearly distinguished.

## Git Intelligence Summary

- Recent commits show ongoing work in templates, Inngest test generation, and background removal; keep new code aligned with existing service patterns and server-side workflows.

## Latest Technical Information

- Shopify Admin GraphQL `products` query supports pagination with `first`/`after` and `pageInfo` cursors; keep fields minimal to reduce payload size.

## Project Context Reference

- Follow project rules in `_bmad-output/project-context.md` (stack versions, strict TS, snake_case payloads, error envelope).

## Story Completion Status

- Ultimate context engine analysis completed - comprehensive developer guide created.

## References

- Epic 4 story 4.1 acceptance criteria. [Source: `_bmad-output/planning-artifacts/epics.md`]
- Shopify Admin GraphQL `products` query. [Source: https://shopify.dev/docs/api/admin-graphql/latest/queries/products]
- Architecture decisions and project structure. [Source: `_bmad-output/planning-artifacts/architecture.md`]
- UX admin patterns (resource list/detail, empty states, feedback). [Source: `_bmad-output/planning-artifacts/ux-design-specification.md`]
- Integration reuse boundaries (Shopify admin auth, service layout). [Source: `_bmad-output/planning-artifacts/architecture.md`]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
