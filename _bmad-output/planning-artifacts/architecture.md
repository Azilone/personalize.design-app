---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7]
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/product-brief-personalize-design-app-2026-01-10.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: '2026-01-10T18:12:00Z'
project_name: 'personalize-design-app'
user_name: 'Kevin'
date: '2026-01-10T15:41:50Z'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
The system is a multi-tenant Shopify app where merchants create and manage reusable design templates (“Blueprints”), assign them to Shopify products, and enable a buyer-facing personalization experience on the product page. Buyers upload a photo (optional text), generate a design preview, view it on mockups, and add the product to cart with personalization metadata. After purchase, the system generates a final print-ready PNG per order line and coordinates fulfillment to Printify.

Architecturally, the functional scope breaks down into:
- Merchant admin: onboarding, template lifecycle (draft/test/publish), assignment to products, storefront settings (limits), spend controls and paid-usage consent.
- Storefront: stepper-based personalization flow, generation lifecycle UI states, retries, limit enforcement messaging, add-to-cart metadata.
- Post-purchase: paid-order detection, final asset generation, attachment/association for supplier fulfillment, fulfillment status tracking, operator/merchant visibility for failures.
- Ops/recovery: reprocess flows, diagnostics/log visibility, safe retries without duplicates.
- Compliance baseline: policy acceptance + reporting/flagging hooks.

**Non-Functional Requirements:**
- Performance: buyer-facing generation must feel fast; explicit p95 latency targets and “time-to-first-preview” budgets drive async design and UI state handling.
- Reliability: retries + idempotency across generation/mockup/fulfillment; clear recoverable “stuck” states; safe reprocessing for failed jobs.
- Security: TLS, secure secret storage, verified webhooks, scoped/time-limited URLs for user uploads and generated assets, baseline abuse controls for public endpoints.
- Integration resilience: Shopify/Printify/fal.ai/storage failures must degrade safely with retries where appropriate and clear error surfacing where not.
- Auditability/billing safety: auditable billable events (generation/fulfillment triggers), spend caps, explicit merchant consent gating paid usage beyond free credits.
- Accessibility & UX correctness: WCAG 2.1 AA target; stable layouts during generation; deterministic “Try again” recovery; preview fidelity as a trust constraint.

**Scale & Complexity:**
- Primary domain: full-stack web app (Shopify embedded admin + storefront extension) with backend async workflows.
- Complexity level: medium-high (multi-tenancy + external integrations + usage billing + async orchestration + asset pipeline).
- Estimated architectural components: ~10–12 (admin UI, storefront UI, core API/data layer, orchestration/workflows, integrations per provider, asset pipeline/storage, billing/usage, observability/ops tooling, analytics/events).

### Technical Constraints & Dependencies

- Multi-tenant model: Shopify shop = tenant (MVP).
- Provider/integration set drives architecture:
  - Shopify: auth, products, cart metadata, webhooks, billing/usage.
  - Printify: fulfillment (MVP-only supplier) and mockups.
  - fal.ai: image generation + tools with strict cost controls.
  - Workflow orchestration: Inngest for generation/mockups/fulfillment and retries.
  - Asset storage: uploads, generated previews, print-ready outputs; must use time-limited/scoped access.
  - Analytics + event logging/telemetry: PostHog for funnel + cost metrics and an event-backed “log” of key workflow states/errors (generation attempts, retries, limit hits, billing consent, order-line processing, fulfillment outcomes), paired with server-side application logs for deep debugging.
- Preview trust constraint: storefront preview/mockups must be consistent with final print-ready output expectations.
- UX surface constraints:
  - Desktop storefront: embedded stepper within product page block (avoid modal for core flow).
  - Mobile storefront: full-screen stepper.
  - Admin uses Polaris patterns; storefront uses shadcn-style primitives with merchant accent theming.

### Cross-Cutting Concerns Identified

- Tenant isolation across data, billing, and configuration.
- Cost governance: credits, caps, consent gating, rate limits/session limits, abuse controls.
- Idempotency + retries across all async steps (generation, mockups, fulfillment, paid-order handling).
- Observability: logs/diagnostics for each job/order line; operator-friendly recovery; PostHog event telemetry for product + ops signals.
- Security of assets and integrations: webhook verification, scoped URLs, secrets management.
- Trust & UX correctness: preview fidelity, clear states, deterministic recovery, accessibility compliance.

## Starter Template Evaluation

### Primary Technology Domain

Shopify embedded web app (admin UI) + Shopify storefront extension, backed by a Node/TypeScript server and a relational DB via Prisma.

### Starter Options Considered

1) Shopify App Template – React Router
- Status: already in-use in this repo
- Strengths: aligned with Shopify tooling/CLI, React Router v7, Prisma session storage patterns, Shopify App Bridge integration
- Fit for UX: supports Polaris admin UI patterns + storefront extension UIs; no conflict with stepper-style buyer flow

2) Shopify App Template – Remix
- Status: viable maintained alternative
- Trade-off: would require migrating the current codebase; not necessary unless there is a strong preference for Remix conventions/ecosystem

### Selected Starter: Shopify App Template – React Router

**Rationale for Selection:**
This project is already initialized on the Shopify React Router template and it matches the product needs (Shopify embedded admin, webhooks, storefront extensions, and a TypeScript full-stack foundation). Keeping it avoids a migration and preserves momentum.

**Initialization Command:**

```bash
shopify app init --template=https://github.com/Shopify/shopify-app-template-react-router
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
- TypeScript (Node-based app)
- React + React Router v7

**Build Tooling:**
- Vite-based build/dev workflow (via React Router tooling)

**Database/Storage Direction:**
- Prisma is already used (and provides a natural path for multi-tenant app data + session storage)

**Shopify Integration Baseline:**
- Shopify CLI-driven local dev
- App Bridge integration patterns
- Webhook routing patterns

**Telemetry / Logging:**
- Add PostHog event telemetry as a “workflow event log” for key product + ops signals (generation attempts, retries, limit hits, billing consent, order-line processing, fulfillment outcomes), paired with server logs for deep debugging.

**Note:** Project initialization using this command is already complete for this repo.

## Core Architectural Decisions

### Data Architecture

**Primary Database (MVP):**
- Decision: Supabase managed Postgres (not SQLite).
- Rationale: avoid single-instance SQLite constraints early; standard Postgres foundation for multi-tenant + workflows.

**Data Access Layer / ORM:**
- Decision: Prisma.

**Validation Strategy:**
- Decision: Prisma for persistence + Zod for runtime validation at API boundaries (admin inputs, storefront requests, Shopify webhooks, internal job payloads).

**Migrations:**
- Decision: Prisma migrations (`prisma/migrations`).

**Caching:**
- Decision: none for MVP; add only if proven necessary (rate limiting storage, hot reads, job state fanout).

**Multi-Tenancy Data Model:**
- Decision: strict `shopId` scoping on all app-owned tables; enforce with composite unique indexes where relevant.

**File/Object Storage:**
- Decision: Supabase Storage for uploads, generated previews, and print-ready outputs.
- Security: private buckets + time-limited signed URLs; avoid exposing service keys client-side.

**Schema Naming (Prisma):**
- Decision: use `snake_case` field names in Prisma schema (align DB + API payload conventions).

### Authentication & Security

**Authentication (Admin):**
- Decision: Use `@shopify/shopify-app-react-router` default auth + Prisma session storage (starter template defaults).

**Authorization / Tenant Isolation:**
- Decision: Enforce strict `shopId` scoping everywhere (DB + application layer); no cross-tenant access paths.

**Webhooks:**
- Decision: Verify Shopify webhook HMAC (`X-Shopify-Hmac-Sha256`) for all webhook routes.
- Decision: Treat all webhook handlers as idempotent.

**Storefront / App Proxy Requests (if used):**
- Decision: Verify app proxy request `signature` when using app proxies.
- Dev constraint (TBC): password-protected dev stores can redirect proxy requests to `/password`, preventing proxy requests from reaching the app (observed blocker); define a dev testing approach (disable password while testing proxy routes, or use an alternate dev-only path for testing).

**Asset Security (uploads/generated/print-ready):**
- Decision: Private storage only + time-limited signed URLs for access.

**Abuse Controls / Rate Limiting:**
- Decision: DB-backed counters for per-product + per-session limits (no cache/Redis for MVP).

**Telemetry Safety (PostHog):**
- Decision: Use PostHog event telemetry as an ops/product signal, but avoid sensitive payloads/PII in event properties.

### API & Communication Patterns

**Primary Server API Surface:**
- Decision: Keep React Router route handlers (loaders/actions) as the primary server API surface (no separate REST layer for MVP).

**Shopify Admin API:**
- Decision: GraphQL-only.

**Storefront → Backend Communication:**
- Decision: App Proxy-first for storefront calls to backend.
- Security: verify app proxy `signature` on all proxy requests.
- Dev constraint: development stores are password-protected; unauthenticated requests can redirect to `/password` and never reach the app. Use an authenticated browser session (entered password / admin-login) for local testing; use a paid/transfer store if you need no-password testing.

**Async Orchestration:**
- Decision: Use Inngest for all workflows (generation, mockups, fulfillment, retries, reprocessing).

**Errors + Logging Standards:**
- Decision: Standard JSON error envelope + stable error codes; structured server logs + PostHog event telemetry for workflow states/errors (no sensitive payloads/PII in event props).

**Development-mode Non-Proxy Access (for local/dev only):**
- Decision: Production storefront traffic uses App Proxy only (no prod fallback).
- Dev-only requirement: provide a non-proxy development path to call backend when App Proxy is blocked by dev-store password constraints.
- Safety constraints (no backdoor):
  - Must be disabled by default and only enabled when `NODE_ENV=development` (and/or an explicit `ENABLE_DEV_BYPASS=true`).
  - Must require a separate secret (e.g. `X-Dev-Bypass-Secret`) that is never shipped to storefront/public code.
  - Must be additionally restricted (at least one): localhost-only, VPN-only IP allowlist, or admin-authenticated session gate.
  - Must be deployed-off in Dokploy/production environments (hard-fail if enabled outside dev).

**Billing Safety (Usage Charges) & Idempotency:**
- Decision: bill the merchant only when an image is successfully produced *and stored* (i.e., when provider cost has been incurred and output is persisted).
- Mechanism:
  - Create a `billable_events` record with a stable `idempotency_key` before provider execution.
  - Only mark the event “chargeable/confirmed” after storage succeeds.
  - Trigger Shopify usage charge from the confirmed event (never directly from transient workflow state).
- Retry safety:
  - Inngest retries must re-use the same `idempotency_key` to prevent duplicate charges.
  - Webhook-driven reprocessing must also preserve idempotency keys per order line + step.
- Telemetry:
  - Emit PostHog events for billing state transitions (e.g. `billing.event_created`, `billing.event_confirmed`, `billing.charge_succeeded`, `billing.charge_failed`) with correlation keys (`shop_id`, `billable_event_id`, `idempotency_key`, `order_line_id` when applicable).

### Frontend Architecture

**Surfaces:**
- Admin (embedded app): Polaris UI patterns.
- Storefront (extension): Tailwind + shadcn-style primitives; stepper-based UX.

**Admin UI Library:**
- Decision: Polaris web components (aligned with current starter/template usage); avoid adding `@shopify/polaris` unless needed later.

**Storefront Styling & Components:**
- Decision: Tailwind CSS + shadcn-style component primitives.

**Client State Management:**
- Decision: Zustand (storefront only) for stepper state (photo selection, generation status, tries remaining, selected template, result assets).

**Shared Validation Schemas:**
- Decision: Shared Zod schemas used by both client + server for:
  - storefront requests (proxy calls),
  - admin inputs (template builder, settings),
  - Shopify webhooks payload validation (post-HMAC),
  - Inngest job payloads.

**Accessibility:**
- Decision: target WCAG 2.1 AA for admin + storefront.

### Infrastructure & Deployment

**Hosting:**
- Decision: VPS + Docker containers managed by Dokploy.

**CI/CD:**
- Decision: Dokploy GitHub-based deployment pipeline (primary CD mechanism).

**Database:**
- Decision: Supabase managed Postgres.

**Object Storage:**
- Decision: Supabase Storage (no Cloudflare R2).

**Observability:**
- Decision: `pino` JSON server logs to stdout (collected by Dokploy) + PostHog for event telemetry and exception/error tracking (no Sentry).

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:**
Naming, file structure, API/error formats, event/telemetry formats, and workflow/job conventions (Inngest) are the highest-risk areas for AI-agent divergence.

### Naming Patterns

**Database Naming Conventions:**
- Tables: `snake_case`, plural (e.g. `design_templates`, `product_templates`).
- Columns: `snake_case` (e.g. `shop_id`, `created_at`).
- Primary keys: `id` (UUID preferred unless strong reason otherwise).
- Foreign keys: `{entity}_id` (e.g. `shop_id`, `design_template_id`).
- Indexes/constraints: explicit names using `snake_case` (e.g. `uniq_design_templates_shop_id_name`).

**API Naming Conventions:**
- Paths: `kebab-case` segments for human readability (e.g. `/api/app-proxy/generate-preview`), but payload fields remain `snake_case`.
- Route params: `:id` style where applicable.

**Code Naming Conventions:**
- Files: `kebab-case` for generic utilities/components; keep existing framework conventions where required by React Router file routing.
- Types/Components: `PascalCase`.
- Functions/variables: `camelCase`.

### Structure Patterns

**Project Organization:**
- Keep server route logic in React Router routes (loaders/actions) unless explicitly creating a separate service module.
- Shared modules:
  - `app/schemas/*` for shared Zod schemas (single source of truth for request/job validation).
  - `app/services/*` for integration/service logic (Shopify, Printify, fal.ai, Supabase, PostHog).
  - `app/jobs/*` (or `app/inngest/*`) for Inngest workflows and triggers.

**Testing Placement (when added):**
- Co-locate tests with source using `*.test.ts(x)` and mirror folder structure.

### Format Patterns

**API Response Formats:**
- All error responses use a consistent envelope:
  - `{ error: { code, message, details? } }`
- Success responses are either direct payloads or `{ data: ... }`, but must be consistent per route family (decide per module and document in that module).
- Dates/timestamps: ISO-8601 strings in UTC (e.g. `2026-01-10T15:41:50Z`).

**Data Exchange Formats:**
- JSON fields: `snake_case` for all API payloads (admin, proxy, webhooks-derived internal payloads, Inngest job payloads).
- Internal TypeScript: keep idiomatic `camelCase`, mapping at boundaries.

### Communication Patterns

**Event System Patterns (PostHog):**
- Event names: `domain.action` (e.g. `generation.started`, `generation.succeeded`, `generation.failed`, `billing.consent_granted`, `fulfillment.submitted`, `fulfillment.failed`).
- Event properties: `snake_case` keys; never include secrets or raw PII.
- Correlation keys: always include `shop_id`, and when relevant `order_id`, `order_line_id`, `job_id`, `request_id`.

**State Management Patterns (Storefront):**
- Zustand store is the single source of truth for the stepper state.
- Persist only what’s needed for the session; do not store secrets or long-lived tokens client-side.

### Process Patterns

**Validation:**
- Validate at boundaries using shared Zod schemas:
  - incoming proxy requests
  - admin form submissions
  - webhook handlers (after HMAC verification)
  - Inngest job payloads

**Error Handling:**
- Map internal errors to stable `error.code` values and log with correlation IDs.
- User-facing copy is calm and action-oriented; technical details remain in server logs and PostHog properties.

**Idempotency & Retries (Inngest + Webhooks):**
- Every async workflow step must define an idempotency key (typically based on `shop_id` + `order_line_id` + step name).
- Retries must be safe and not duplicate billing events or supplier fulfillment actions.

### Enforcement Guidelines

**All AI Agents MUST:**
- Use `snake_case` for DB + API payload fields; map to TS `camelCase` internally.
- Use the standard error envelope `{ error: { code, message, details? } }`.
- Use PostHog event names in `domain.action` format with required correlation keys.
- Validate all boundary inputs with shared Zod schemas.

**Pattern Enforcement:**
- Add a short “conventions” section to any new module that introduces a new route family or workflow.
- Reject PRs/changes that introduce inconsistent naming/formatting for the same concern.

## Project Structure & Boundaries

### Complete Project Directory Structure

```
personalize-design-app/
├── README.md
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.json
├── vite.config.ts
├── Dockerfile
├── shopify.app.toml
├── shopify.web.toml
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── app/
│   ├── root.tsx
│   ├── entry.server.tsx
│   ├── routes.ts
│   ├── shopify.server.ts
│   ├── db.server.ts
│   ├── schemas/
│   │   ├── common.ts
│   │   ├── app_proxy.ts
│   │   ├── webhooks.ts
│   │   ├── inngest.ts
│   │   └── admin.ts
│   ├── lib/
│   │   ├── errors.ts
│   │   ├── http.ts
│   │   ├── ids.ts
│   │   └── tenancy.ts
│   ├── services/
│   │   ├── shopify/
│   │   │   ├── admin_graphql.ts
│   │   │   ├── billing.ts
│   │   │   └── hmac.ts
│   │   ├── app_proxy/
│   │   │   └── signature.ts
│   │   ├── printify/
│   │   │   ├── client.ts
│   │   │   ├── mockups.ts
│   │   │   └── fulfillment.ts
│   │   ├── fal/
│   │   │   ├── client.ts
│   │   │   └── generate.ts
│   │   ├── supabase/
│   │   │   ├── client.server.ts
│   │   │   ├── storage.ts
│   │   │   └── signed_urls.ts
│   │   └── posthog/
│   │       ├── client.server.ts
│   │       ├── events.ts
│   │       └── errors.ts
│   ├── inngest/
│   │   ├── client.server.ts
│   │   └── functions/
│   │       ├── generation.ts
│   │       ├── mockups.ts
│   │       └── fulfillment.ts
│   └── routes/
│       ├── app.tsx
│       ├── app._index.tsx
│       ├── auth.$.tsx
│       ├── auth.login/route.tsx
│       ├── webhooks.app.uninstalled.tsx
│       ├── webhooks.app.scopes_update.tsx
│       └── app-proxy/
│           ├── generate-preview.tsx
│           ├── mockups.tsx
│           └── add-to-cart.tsx
├── extensions/
│   └── personalize-design-app/
│       ├── shopify.extension.toml
│       ├── blocks/
│       │   ├── personalize_stepper.liquid
│       │   └── star_rating.liquid
│       ├── assets/
│       │   ├── personalize-stepper.js
│       │   ├── personalize-stepper.css
│       │   └── thumbs-up.png
│       ├── locales/
│       │   └── en.default.json
│       └── snippets/
│           └── stars.liquid
└── _bmad-output/
    └── planning-artifacts/
        ├── prd.md
        ├── ux-design-specification.md
        └── architecture.md
```

### Architectural Boundaries

**API Boundaries:**
- Admin UI routes: `app/routes/app*.tsx` (Polaris web components UI, merchant workflows)
- Webhooks: `app/routes/webhooks.*` (HMAC-verified, idempotent)
- App Proxy: `app/routes/app-proxy/*` (signature-verified, `snake_case` payloads, returns `{ error: { code, message, details? } }` on failure)

**Service Boundaries:**
- All third-party calls live in `app/services/*` (Shopify, Printify, fal.ai, Supabase, PostHog)
- Routes call services; services never import routes

**Data Boundaries:**
- Prisma models/migrations in `prisma/`
- Tenant enforcement via `shop_id` everywhere (helper in `app/lib/tenancy.ts`)

**Workflow Boundaries (Inngest):**
- All async steps live in `app/inngest/functions/*`
- Job payloads validated by `app/schemas/inngest.ts`
- Idempotency keys required per step

### Requirements to Structure Mapping

- Merchant admin (templates, assignments, limits, consent): `app/routes/app*` + `app/services/*` + Prisma models
- Buyer stepper UI: `extensions/personalize-design-app/blocks/personalize_stepper.liquid` + `extensions/.../assets/personalize-stepper.(js|css)`
- Storefront generation/preview/mockups: `app/routes/app-proxy/*` + `app/services/fal/*` + `app/services/printify/*` + `app/services/supabase/*`
- Paid order processing + fulfillment: `app/routes/webhooks.*` triggers Inngest; `app/inngest/functions/fulfillment.ts`
- Telemetry/errors: `app/services/posthog/*` (events `domain.action`, `snake_case` props, correlation keys)

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
The stack is internally consistent: Shopify React Router app + Prisma + Supabase Postgres/Storage + App Proxy + Inngest + Tailwind/shadcn storefront bundle + Zustand + shared Zod schemas + PostHog.

**Pattern Consistency:**
Conventions are consistent across boundaries:
- `snake_case` for DB + API payloads, and (by decision) `snake_case` field names in Prisma schema.
- Standard error envelope `{ error: { code, message, details? } }`.
- PostHog events in `domain.action` with correlation keys.

**Structure Alignment:**
The structure isolates integrations (`app/services/*`), validation (`app/schemas/*`), workflows (`app/inngest/*`), and boundary routes (`app/routes/app-proxy/*`, `app/routes/webhooks.*`) to prevent agent divergence.

### Requirements Coverage Validation ✅

**Functional Requirements Coverage:**
- Merchant admin (templates, assignment, limits, consent): covered by admin routes + services + DB.
- Buyer personalization (upload/generate/preview/regenerate/add-to-cart): covered by theme app extension block + App Proxy routes.
- Paid order handling + fulfillment + recovery: covered by webhooks + Inngest workflows + integrations.
- Spend safety/limits/billing audit: covered by boundary validation + DB-backed counters + PostHog events + server logs.

**Non-Functional Requirements Coverage:**
- Performance: async workflows + UX loading/retry patterns.
- Reliability: idempotency keys + safe retries (webhooks + Inngest); billing emitted only after “generated + stored” using `billable_events` ledger + idempotency.
- Security: HMAC webhooks, proxy signature verification, private storage + signed URLs, strict tenant scoping.
- Observability: pino JSON logs to stdout + PostHog event/error telemetry.

### Implementation Readiness Validation ✅

**Decision Completeness:**
Core decisions are defined (DB/storage, comms, orchestration, UI stack, conventions, deployment).

**Structure Completeness:**
Tree and boundaries are explicit and minimize ambiguity for AI agents.

**Pattern Completeness:**
High-risk conflict points are addressed (naming, error envelope, event naming, validation schemas, idempotency/retry safety).

### Gap Analysis Results

**Important (non-blocking) gaps to decide during implementation:**
- Finalize exact `idempotency_key` format per workflow step (preview vs regenerate vs final print-ready per `order_line_id`).
- Finalize required PostHog properties per event (especially billing/fulfillment).
- Finalize bucket layout and retention policy in Supabase Storage (uploads/previews/print_ready).

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION  
**Confidence Level:** high

## Architecture Completion Summary

### Workflow Completion

**Architecture Decision Workflow:** COMPLETED ✅  
**Total Steps Completed:** 8  
**Date Completed:** 2026-01-10T18:12:00Z  
**Document Location:** `_bmad-output/planning-artifacts/architecture.md`

### Final Architecture Deliverables

- Complete architecture decisions + rationale
- Implementation patterns to prevent AI-agent conflicts
- Concrete project structure + boundaries mapping
- Validation confirming coherence, coverage, and implementation readiness

### Implementation Handoff

**AI agent guidelines:**
- Follow decisions and patterns exactly as documented.
- Use `snake_case` for DB + API payloads and the standard error envelope.
- Use App Proxy for storefront in production; dev-only non-proxy path must meet “no backdoor” constraints.
- Bill only after image is generated and stored, using a `billable_events` ledger + idempotency keys.

**Suggested first implementation focus:**
- Establish shared Zod schemas + error/logging utilities (`pino` JSON logs + PostHog events/errors).
- Implement App Proxy endpoints for preview generation with strict validation + signature verification.
