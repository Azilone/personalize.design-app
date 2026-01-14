# Story 1.3: Spend Safety Onboarding (Routing + Disclosure)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a merchant,
I want onboarding to clearly explain spend safety and route me to configure it,
so that I understand the pricing and can avoid surprise charges.

## Acceptance Criteria

1. **Given** the merchant is in onboarding and spend safety is not configured
   **When** they open the “Spend safety” step
   **Then** the app shows the following billing disclosure clearly (no ambiguity):
   - “You start with a **$1.00 USD free AI usage gift**.”
   - “Current pricing (USD): **$0.05** per generated image; **$0.025** per remove background operation.”
   - “Billable actions: **generate**, **regenerate**, **remove background**.”
   - “Printify mockup generation is **not** billed.”
   - “After the gift is used, usage is billed via **Shopify Usage Charges**.”
   - “You will **not be charged** unless you **enable paid usage**.”
   - “Your **monthly spending cap** limits the maximum amount that can be charged in a month.”

2. **Given** the spend safety step is shown
   **When** the merchant clicks “Configure spend safety”
   **Then** they are taken to the Billing/Spend Safety settings screen (Epic 5)

3. **Given** the merchant returns to onboarding after configuring spend safety
   **When** the checklist is rendered
   **Then** the “Spend safety” item is `Complete` only if:
   - a valid monthly cap is configured
   - paid usage consent is recorded (audit timestamp)

## Tasks / Subtasks

- [x] Add a Spend Safety onboarding step page (AC: 1–2)
  - [x] Render the disclosure copy verbatim and clearly (no ambiguity)
  - [x] Provide a primary CTA “Configure spend safety” that routes to Billing/Spend Safety settings
  - [x] Only show this step when spend safety is not configured; otherwise redirect back to `/app`

- [x] Wire the onboarding step into the dashboard checklist (AC: 2)
  - [x] Update the “Spend safety” checklist item action link to point to the onboarding step
  - [x] Preserve embedded query params (`host`, `embedded`, `shop`, `locale`) via `buildEmbeddedSearch`

- [x] Make checklist completion accurate (AC: 3)
  - [x] Keep `Spend safety` = `Incomplete` until BOTH cap + consent exist (source via `getShopReadinessSignals(shop_id)`)
  - [x] Avoid “fake complete” UI states (server must be able to prove configuration)

- [x] Polish UX states
  - [x] Use calm, trust-preserving copy; deterministic “next step” action
  - [x] Keep layout stable and scannable (fits Polaris admin patterns)

### Review Follow-ups (AI)

- [x] [AI-Review][High] Persist spend safety configuration (monthly cap + paid usage consent) and wire `getShopReadinessSignals` to real data so the onboarding step can redirect and the checklist can complete when configured. [app/services/shops/readiness.server.ts:12] [app/routes/app.billing.tsx:1] [prisma/schema.prisma:44]

## Dev Notes

### Developer Context (What’s tricky / what to avoid)

- This is a “trust” moment: merchants must understand costs + consent before anything billable happens.
- The disclosure copy must be **exact and unambiguous** (don’t paraphrase; don’t hide the billable actions).
- This onboarding step must not pretend spend safety is configured; completion is server-authoritative.
- Avoid introducing any “dev bypass” or client-only gating; the existing access gate in `app/routes/app.tsx` stays the source of truth.

### UX Intent

- Keep it lightweight: explain, then route to configuration.
- Default state is safe: if spend safety isn’t configured, the user should be guided but not forced into surprise charges.
- Keep tone calm and operational; no “AI tool” language.

### Technical Requirements

- Disclosure content must match AC #1 exactly (including the specific USD amounts and the list of billable actions).
- The “Configure spend safety” CTA must route to the Billing/Spend Safety settings screen (currently `/app/billing`).
- Completion logic for “Spend safety” must be derived from server data:
  - `monthly_cap` is configured (non-null, > 0)
  - paid usage consent is recorded with an audit timestamp
- Source of truth for readiness signals is `getShopReadinessSignals(shop_id)` (`app/services/shops/readiness.server.ts`).
- Embedded admin links must preserve embedded query params using `buildEmbeddedSearch` (`app/lib/embedded-search.ts`).

### Architecture Compliance

- Keep Shopify React Router template patterns; do not introduce a parallel API server.
- Routes (`app/routes/*`) own HTTP + loaders/actions; integrations and persistence live in services (`app/services/*`).
- TypeScript stays `strict: true`; keep ESM (`"type": "module"`), use `import`/`export`.
- Use shared Zod schemas for any new boundary validation (forms/actions); don’t duplicate validation.
- Naming: internal `camelCase`, DB + wire payloads `snake_case`.
- Logging: pino JSON to stdout; PostHog events with `snake_case` props and correlation keys; never log secrets/PII.

### Library / Framework Requirements

- Admin UI: use Shopify App React Router + Polaris web components (`<s-*>`) following existing screens (`app/routes/app._index.tsx`, `app/routes/app.paywall.tsx`).
- Router: `react-router` v7 (file-based routes via `@react-router/fs-routes`).
- No dependency upgrades in this story; use versions pinned in `package.json`.

### File Structure Requirements

- New onboarding step route (recommended): `app/routes/app.onboarding.spend-safety.tsx` (expected path: `/app/onboarding/spend-safety`).
- Billing settings route (destination): `app/routes/app.billing.tsx` (path: `/app/billing`).
- Dashboard checklist rendering: `app/routes/app._index.tsx`.
- Checklist item definitions: `app/lib/readiness.ts` (update the `spend_safety` item action to point to the onboarding step if you add it).
- Readiness signal source: `app/services/shops/readiness.server.ts` (must eventually reflect real spend safety configuration).
- Embedded query param preservation: `app/lib/embedded-search.ts`.

### Testing Requirements

- Use existing `vitest` setup (`npm test`).
- If you change the spend safety action link (e.g., to `/app/onboarding/spend-safety`), update and extend `app/lib/readiness.test.ts` to assert the new path.
- If you introduce any pure helper to build the disclosure content, add a small unit test next to it (`*.test.ts`).
- Avoid adding new testing frameworks.

### Previous Story Intelligence

- Story 1.2 established a server-authoritative dashboard checklist:
  - Checklist items are provided by the `/app` loader (`app/routes/app.tsx`) as `readinessItems`.
  - Embedded query params are preserved via `buildEmbeddedSearch` (`app/lib/embedded-search.ts`).
- The current spend safety destination route exists as a placeholder: `app/routes/app.billing.tsx`.
- Avoid hardcoding “Complete” states in the UI; completion must be provable from server-side readiness signals (`app/services/shops/readiness.server.ts`).
- Story 1.1 established paywall gating and plan state patterns; keep onboarding pages behind the same gate in `app/routes/app.tsx`.

### Git Intelligence Summary

- Recent commit titles are mostly setup/scaffolding (`setup paywall`, `bmad setup`).
- Treat the existing implemented patterns as the source of truth:
  - Billing gating + redirects: `app/routes/app.tsx`
  - Paywall/billing flows: `app/routes/app.paywall.tsx`, `app/routes/app.billing.confirm.tsx`
  - Dashboard checklist UI: `app/routes/app._index.tsx`
  - Checklist mapping tests: `app/lib/readiness.test.ts`

### Latest Tech Information

- Use pinned versions from `package.json`; do not upgrade in this story:
  - `react-router` `^7.12.0`
  - `@shopify/shopify-app-react-router` `^1.1.0`
  - `prisma` / `@prisma/client` `^6.16.3`
  - `zod` `^4.3.5`
  - `pino` `^10.1.1`
  - `posthog-node` `^5.20.0`
  - `vitest` `^4.0.17`
- Node runtime per `package.json` engines: `>=20.19 <22 || >=22.12`.

### Project Context Reference

- Guardrails: `AGENTS.md` and `_bmad-output/project-context.md`.
- Architecture decisions and folder boundaries: `_bmad-output/planning-artifacts/architecture.md`.
- Requirements + UX intent: `_bmad-output/planning-artifacts/epics.md`, `_bmad-output/planning-artifacts/prd.md`, `_bmad-output/planning-artifacts/ux-design-specification.md`.

### Story Completion Status

- Status set to `ready-for-dev` when this story file is saved and `sprint-status.yaml` is updated.
- This story is “done” when the onboarding disclosure exists, routes correctly to billing settings, and the dashboard checklist completion remains server-authoritative.

### References

- Story requirements + disclosure copy: [Source: `_bmad-output/planning-artifacts/epics.md` → Epic 1 → Story 1.3]
- Billing + consent + cap behavior: [Source: `_bmad-output/planning-artifacts/prd.md` → “Limits, Spend Safety, and Billing Consent”]
- UX tone + deterministic recovery guidance: [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` → “Feedback Patterns”]
- Architecture guardrails (route/service separation, Zod boundaries, billing safety principles): [Source: `_bmad-output/planning-artifacts/architecture.md`]
- Agent guardrails (snake_case, error envelope, no dev bypass backdoor, logging rules): [Source: `AGENTS.md`] [Source: `_bmad-output/project-context.md`]
- Existing implementation patterns to reuse:
  - Dashboard + checklist UI: [Source: `app/routes/app._index.tsx`]
  - Access gating + loader data: [Source: `app/routes/app.tsx`]
  - Spend safety placeholder route: [Source: `app/routes/app.billing.tsx`]
  - Checklist mapping + action links: [Source: `app/lib/readiness.ts`] [Source: `app/lib/readiness.test.ts`]
  - Readiness signal source: [Source: `app/services/shops/readiness.server.ts`]
  - Embedded query param preservation: [Source: `app/lib/embedded-search.ts`]

## Dev Agent Record

### Agent Model Used

GPT-5.2 (Codex CLI)

### Debug Log References

- Implementation plan: Add spend safety onboarding route, update readiness checklist/link and server signals, then update tests.

### Completion Notes List

- Added spend safety onboarding page with disclosure copy and billing CTA (redirects when configured).
- Implemented spend safety settings persistence (billing route + database) and wired readiness signals to real data.
- Added unit tests for embedded query param preservation.
- Resolved code review follow-up and marked story/sprint status as done.
- Tests: npm test -- app/lib/embedded-search.test.ts app/lib/readiness.test.ts.

### File List

- app/routes/app.onboarding.spend-safety.tsx
- app/routes/app.billing.tsx
- app/routes/app.\_index.tsx
- app/routes/app.tsx
- app/routes/app.printify.tsx
- app/routes/app.storefront.tsx
- app/lib/embedded-search.ts
- app/lib/embedded-search.test.ts
- app/lib/readiness.ts
- app/lib/readiness.test.ts
- app/services/shops/readiness.server.ts
- app/services/shops/spend-safety.server.ts
- app/schemas/admin.ts
- prisma/schema.prisma
- prisma/migrations/20260113190000_add_shop_spend_safety/migration.sql
- \_bmad-output/implementation-artifacts/1-3-spend-safety-onboarding-routing-disclosure.md
- \_bmad-output/implementation-artifacts/1-2-onboarding-dashboard-setup-readiness-checklist.md
- \_bmad-output/implementation-artifacts/sprint-status.yaml
- \_bmad-output/implementation-artifacts/validation-report-2026-01-13T14-16-43Z.md

### Change Log

- 2026-01-13: Added spend safety onboarding step, updated readiness checklist link and spend safety readiness check, and updated tests.
- 2026-01-13: Added embedded search unit tests and documented review follow-up; updated story status and file list.
- 2026-01-13: Implemented spend safety settings persistence (billing route + Prisma) and wired readiness to stored configuration.
