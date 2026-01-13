# Story 1.2: Onboarding Dashboard + Setup Readiness Checklist

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a merchant,
I want an onboarding dashboard that shows my setup readiness status,
so that I can quickly understand what’s blocking me from going live.

## Acceptance Criteria

1. **Given** the shop has activated Early Access or subscribed to Standard
   **When** the merchant opens the app
   **Then** they land on an onboarding/dashboard screen that summarizes setup readiness

2. **Given** the onboarding/dashboard is shown
   **When** the merchant views the “Setup checklist”
   **Then** they can see a clear status for each prerequisite item (e.g., `Complete` / `Incomplete`)
   **And** the checklist includes at least:
   - Printify connection status (connected vs not connected)
   - Storefront personalization status (enabled vs disabled at shop level)
   - Spend safety status (monthly cap configured + paid usage consent recorded vs not configured)
   - Plan status (Early Access active)

3. **Given** a checklist item is incomplete
   **When** the merchant views it
   **Then** the UI shows a short “what to do next” hint (onboarding content like roadmap/video is nice-to-have)

## Tasks / Subtasks

- [ ] Onboarding dashboard readiness checklist UI (AC: 1–3)
  - [ ] Render checklist list with status labels and hint copy
  - [ ] Show plan status banner summary

- [ ] Readiness data sourcing (AC: 2)
  - [ ] Plan status from `ShopPlan` (already in loader)
  - [ ] Printify connection status (future Epic 2 integration; define placeholder now)
  - [ ] Storefront personalization status (shop-level setting; define storage/source)
  - [ ] Spend safety status (monthly cap + paid usage consent; future Epic 5)

- [ ] Server-side loader data for checklist
  - [ ] Extend `app/routes/app._index.tsx` or shared loader to provide readiness items

- [ ] Incomplete-item hints
  - [ ] Provide next-step hints and links to relevant settings/screens

## Dev Notes

### Developer Context (What’s tricky / what to avoid)

- This dashboard is the first post-paywall surface. It must stay **server-authoritative** (no client-only gating).
- Readiness items must be **honest**: do not show "Complete" unless the server can prove the prerequisite is configured.
- For items not implemented yet (Printify, spend safety, storefront enable), mark **Incomplete** with "Coming soon" or a clear next step.
- Keep UX aligned with onboarding guidance: linear checklist with a clear next action and lightweight hint copy.

### Technical Requirements (Developer Guardrails)

- Source of truth for plan status is `ShopPlan` in the DB; use existing loader data from `app/routes/app.tsx`.
- Define a typed readiness model for the UI (e.g., array of `{ key, label, status, hint, actionHref }`).
- Status rules (initial MVP):
  - Plan status: `Complete` when `PlanStatus` is `standard` or `early_access`; otherwise `Incomplete`.
  - Printify connection: `Incomplete` until Epic 2 adds integration (stub value for now).
  - Storefront personalization: `Incomplete` until shop-level setting exists (future Epic 1.4/4.2).
  - Spend safety: `Incomplete` until cap + paid-usage consent exists (future Epic 5).
- Do not add client-side secrets; anything derived from Shopify or DB must come from loaders/services.
- Ensure readiness data is still safe when `plan_status` is pending (show pending banner, keep checklist incomplete).

### Architecture Compliance

- Keep Shopify React Router template patterns; **no parallel server framework**.
- Use `app/routes/*` for HTTP/loader handling and `app/services/*` for integrations (services must not import routes).
- TypeScript `strict: true`, ESM only, `async/await` for async flows.
- Validate boundaries with shared Zod schemas (if adding new boundary inputs).
- Naming: internal `camelCase`, DB + wire payloads `snake_case`.
- Logging: pino JSON to stdout; PostHog events with `snake_case` props and correlation keys; never log secrets/PII.

### Library / Framework Requirements

- Admin UI should use Shopify App React Router + Polaris web components (`<s-*>`) per existing patterns.
- Shopify Admin API usage is **GraphQL-only** (if any calls are needed later).
- Use the versions pinned in `package.json` (no upgrades in this story).

### File Structure Requirements

- Dashboard UI lives in `app/routes/app._index.tsx` (current "Dashboard" screen).
- Loader data should come from `app/routes/app.tsx` or dedicated service helpers.
- Future readiness sources should be encapsulated in services (e.g., `app/services/*`) and mapped to UI in the route.

### Testing Requirements

- Add unit tests for any readiness-mapping helpers (co-locate `*.test.ts` next to module).
- Favor small pure-function tests; no new big testing frameworks.

### Previous Story Intelligence

- Story 1.1 established server-authoritative gating and redirects to the dashboard after plan activation.
- Keep plan state persisted and avoid client-only flags for access decisions.
- Never log secrets/PII (invite code); keep PostHog props `snake_case` with correlation keys.

### Git Intelligence Summary

- Recent work added paywall + plan activation flows and touched `app/routes/app.tsx`, `app/routes/app._index.tsx`, `app/services/shops/plan.server.ts`, and Prisma schema.
- Follow those patterns for routing, loader data, and plan state usage to avoid regressions.

### Latest Tech Information (checked Jan 13, 2026)

- React Router changelog lists v7.10.1 on Dec 4, 2025; do not change versions in this story and follow `package.json` pins.
- Shopify app react router docs show v1 as the current major; keep current package usage.
- Prisma ORM changelog highlights 6.x releases (e.g., 6.5.0 on Feb 20, 2025); stay on pinned 6.x versions and defer upgrades.

### Project Context Reference

- Architecture + workflow rules are centralized in `AGENTS.md` and `_bmad-output/project-context.md`.

### Story Completion Status

- Status set to `ready-for-dev` once this context doc is saved and sprint status is updated.

### Project Structure Notes

- Routes already in use: `app/routes/app.tsx` (loader + gating) and `app/routes/app._index.tsx` (Dashboard UI).
- Services to consult or extend: `app/services/shops/plan.server.ts` for plan status data.
- If you introduce new readiness flags, ensure DB fields are `snake_case` in Prisma schema and mapped in service layer.

### References

- Story requirements + acceptance criteria: [Source: _bmad-output/planning-artifacts/epics.md#Story 1.2]
- Onboarding/checklist UX guidance: [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Navigation Patterns]
- Onboarding + setup requirements: [Source: _bmad-output/planning-artifacts/prd.md#Merchant Setup & Onboarding]
- Storefront enablement + spend safety requirements: [Source: _bmad-output/planning-artifacts/prd.md#Storefront Enablement & Controls] [Source: _bmad-output/planning-artifacts/prd.md#Limits, Spend Safety, and Billing Consent]
- Existing plan gating + dashboard entry: [Source: app/routes/app.tsx] [Source: app/routes/app._index.tsx]
- Plan persistence schema: [Source: prisma/schema.prisma] [Source: app/services/shops/plan.server.ts]
- Project rules/guardrails: [Source: AGENTS.md] [Source: _bmad-output/project-context.md]
- Previous story learnings: [Source: _bmad-output/implementation-artifacts/1-1-paywall-early-access-activation-invite-code.md]
- Runtime/library versions: [Source: package.json]

## Dev Agent Record

### Agent Model Used

Codex CLI (GPT-5)

### Debug Log References

- _bmad-output/implementation-artifacts/validation-report-2026-01-13T13-03-21Z.md

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Sprint status updated: 1-2-onboarding-dashboard-setup-readiness-checklist -> ready-for-dev.
- Validation report generated for create-story checklist.

### File List

- _bmad-output/implementation-artifacts/1-2-onboarding-dashboard-setup-readiness-checklist.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- _bmad-output/implementation-artifacts/validation-report-2026-01-13T13-03-21Z.md
