# Story 1.1: Paywall + Early Access Activation (Invite Code)

Status: review

Story Key: 1-1-paywall-early-access-activation-invite-code
Generated: 2026-01-12

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a merchant,
I want to see the default pricing paywall and either subscribe to the Standard plan or unlock Early Access with an invite code,
so that I can access the product and understand pricing clearly.

## Acceptance Criteria

1. **Default paywall gating**
   - **Given** a shop opens the embedded admin app and does not have Early Access activated
   - **When** they arrive in the app
   - **Then** they see a paywall showing the default pricing (**$19/month + $0.25 per successful personalized order line**)
   - **And** they cannot access the rest of the app until they unlock access
   - **And** the paywall offers:
     - a “Subscribe” CTA (Standard plan)
     - an “Invite code” field + “Unlock Early Access” CTA
   - **And** the paywall clearly states:
     - Standard includes a **7-day free trial** for the $19/month access fee
     - Standard and Early Access both include a one-time **$1.00 free AI usage gift**

2. **Subscribe → Standard plan activation**
   - **Given** the merchant clicks “Subscribe”
   - **When** they confirm the subscription in Shopify
   - **Then** the system activates the **Standard** plan for that shop (**$19/month**)
   - **And** the system creates a Shopify app subscription for the shop with recurring price **$19/month** and a **7-day free trial** (so Shopify Usage Charges can be used)
   - **And** the system grants a **$1.00 USD free AI usage gift** to the shop and shows this in the billing UI
   - **And** the UI clarifies the 7-day trial applies only to the **$19/month** access fee (it does not waive AI usage charges or the $0.25/order line fee)
   - **And** the merchant is redirected into onboarding/dashboard

3. **Invite code → Early Access activation**
   - **Given** the merchant enters the invite code `EARLYACCESS` (case-sensitive)
   - **When** they submit the form
   - **Then** the system activates **Early Access** for that shop (**$0/month** access; per-order fee waived during Early Access)
   - **And** the system creates a Shopify **subscription** for the shop with recurring price **$0/month** (so Shopify Usage Charges can be used)
   - **And** the system grants a **$1.00 USD free AI usage gift** to the shop and shows this in the billing UI
   - **And** the UI clearly indicates the shop is in **Early Access** (privileged state)
   - **And** the merchant is redirected into onboarding/dashboard

4. **Invalid invite code handling (basic anti-bruteforce)**
   - **Given** the merchant enters any other code
   - **When** they submit the form
   - **Then** the shop remains on the paywall
   - **And** an error message is shown (generic; does not reveal whether a code exists)
   - **And** the UI shows a fake loading state for ~3 seconds before responding (basic anti-bruteforce friction)

## Scope Notes (MVP)

- This story only establishes **access gating** (paywall), **plan activation**, and **Early Access** unlock; onboarding steps and readiness checklist are handled in Story 1.2+.
- This story must ensure a subscription exists even on $0/month (Early Access) so Shopify Usage Charges can be used later.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` → Epic 1 → Story 1.1]

## Tasks / Subtasks

- [x] Admin access gate + routing (AC: 1)
  - [x] Ensure “no plan / no Early Access” shops land on Paywall screen (hard gate; cannot access other admin areas)
  - [x] Ensure “activated” shops skip Paywall and go directly to onboarding/dashboard (Story 1.2)
  - [x] Persist + read plan state server-side (do not rely on client-only flags)

- [x] Standard plan subscription (AC: 2)
  - [x] Implement Shopify Billing “Subscribe” flow to create app subscription: **$19/month** with **7-day trial**
  - [x] On success: persist subscription identifiers + plan status; grant **$1.00 USD** free AI usage gift
  - [x] Redirect to onboarding/dashboard

- [x] Early Access invite-code unlock (AC: 3–4)
  - [x] Build invite-code form flow with fixed code `EARLYACCESS` (case-sensitive)
  - [x] Always respond with **generic** error on invalid codes; do not reveal whether any code exists
  - [x] Add ~3s fake loading delay on invalid code path (basic brute-force friction)
  - [x] On success: activate Early Access plan; create required Shopify subscription (must enable future usage charges) and grant **$1.00 USD** free AI usage gift; redirect to onboarding/dashboard

- [x] Telemetry + logs
  - [x] Emit PostHog events for paywall views, subscribe clicked/succeeded/failed, invite unlock attempted/succeeded/failed (snake_case props + correlation keys)
  - [x] Add structured pino logs without secrets/PII (never log invite code value)

- [x] Guardrails + edge cases
  - [x] Make all server mutations idempotent per `shop_id` (repeat submits / refreshes should not create duplicate subscriptions or duplicate gift records)
  - [x] Handle “already subscribed/activated” gracefully (show onboarding/dashboard; do not re-create subscription)
  - [x] Ensure Shopify billing errors render actionable UX (retry, contact support) without leaking internals

## Dev Notes

### Developer Context (What’s tricky / what to avoid)

- This is the **first gate** into the app: if it’s wrong, everything else is wrong. Keep gating **server-authoritative**.
- Billing must be **safe + idempotent**:
  - Do not create duplicate subscriptions on retries.
  - Do not create duplicate “$1 gift” ledger entries on retries.
- Early Access is a “privileged state”:
  - access fee **$0/month**
  - per-order fee **waived** during Early Access (implemented in Epic 7 logic later; call out here so it isn’t forgotten)
- Invite code handling must not leak:
  - never log the invite code
  - generic error copy
  - add fake delay (~3s) only on invalid path

### Technical Requirements (Developer Guardrails)

### Billing / Shopify requirements

- Use **Shopify Admin GraphQL** billing APIs (GraphQL-only; no REST billing calls).
- Standard plan:
  - Create an **app subscription** with recurring price **$19/month** and **7-day trial**.
  - After activation, store subscription reference IDs for later verification and usage charges.
- Early Access:
  - Create an app subscription that results in an “active subscription context” to support **future Shopify Usage Charges**, while keeping **$0/month** access fee.
  - If Shopify disallows a $0 recurring subscription in your app’s billing configuration, adjust approach but preserve acceptance criteria: Early Access must be $0/month and still enable usage charges later.
- Currency: USD.

### Data / accounting requirements

- On successful activation (Standard or Early Access), grant a **one-time $1.00 USD free AI usage gift** to the shop.
- Persist plan state in DB keyed by `shop_id` and enforce it on every admin request.

### Security & privacy requirements

- Never log secrets or PII. Specifically: do not log invite code values; do not log full Shopify payloads containing customer info.
- Keep the existing Shopify React Router template patterns; do not introduce a parallel server framework.

### Architecture Compliance

- TypeScript `strict: true` (do not weaken TS config).
- Keep ESM (`type: module`); use `import`/`export`.
- Routes live under `app/routes/*` and must call `app/services/*`; services must **not** import routes.
- Validate boundary inputs with shared **Zod** schemas (no duplicated validation logic).
- Naming:
  - internal code: `camelCase`
  - DB + wire payloads: `snake_case`
- Logging/telemetry:
  - pino JSON logs to stdout
  - PostHog events use `snake_case` props and include correlation keys (at least `shop_id`, plus subscription IDs when present)

### Library / Framework Requirements

- Admin app stack: React 18 + react-router v7 + `@shopify/shopify-app-react-router` (follow existing template).
- Shopify Admin API usage is **GraphQL-only**.
- Prisma for persistence; follow existing `snake_case` Prisma-field convention per architecture decision.

### File Structure Requirements (Expected locations)

Follow the established boundaries from `_bmad-output/planning-artifacts/architecture.md`:

- Admin route(s) (UI + form actions):
  - `app/routes/app._index.tsx` (likely gate/redirect)
  - Add a dedicated paywall route if needed (e.g. `app/routes/app.paywall.tsx`)
- Shopify billing integration:
  - `app/services/shopify/admin_graphql.ts` (GraphQL client)
  - `app/services/shopify/billing.ts` (subscription creation helpers)
- Validation:
  - `app/schemas/admin.ts` (schemas for paywall form submissions)
- Errors/logging helpers:
  - `app/lib/errors.ts` and pino logger utilities
- Tenancy:
  - `app/lib/tenancy.ts` (ensure `shop_id` is threaded through and enforced)

### Testing Requirements

- Add small unit tests for:
  - invite-code validator (case-sensitive) and “generic error” response behavior
  - idempotency key builders for “subscription activation” and “gift grant”
- If integration tests exist in this repo, add a focused integration test around the billing flow’s GraphQL mutation payload shape (do not add a new large test framework just for this).

### Git Intelligence (Recent Work Context)

- Recent commits are BMAD scaffolding (`bmad setup`, `complete bmad workflow`). There are no existing implementation patterns to reuse yet; treat architecture doc as the source of truth for structure.

### Project Structure Notes

- Use the architecture-defined structure and boundaries; do not invent new folders/servers for billing.
- Keep all billing mutations behind `app/services/shopify/*` and keep routes thin.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` → Epic 1 → Story 1.1]
- [Source: `_bmad-output/planning-artifacts/architecture.md` → “Billing Safety (Usage Charges) & Idempotency” + “Project Structure & Boundaries”]
- [Source: `_bmad-output/planning-artifacts/prd.md` → Pricing/Billing sections]
- [Source: `_bmad-output/project-context.md` → Critical Implementation Rules]

### Latest Technical Information (External)

- Shopify Admin GraphQL `appSubscriptionCreate` (API reference): https://shopify.dev/docs/api/admin-graphql/2026-01/mutations/appSubscriptionCreate
- Shopify “Billing”: https://shopify.dev/docs/apps/build/billing
- Partner Dashboard billing configuration (app plans): https://help.shopify.com/en/partners/manage-clients-and-stores/partner-dashboard/managing-your-business/billing/billing-your-app-users

Implementation notes to keep developers aligned with current docs:

- `appSubscriptionCreate` requires defining `lineItems` (recurring and/or usage pricing), and supports `trialDays` for free trials.
- Prefer using a pinned Admin API version (e.g. `2026-01`) consistently in the GraphQL client and keep it updated intentionally.

### Project Context Reference

- This project’s agent-critical guardrails are in `_bmad-output/project-context.md` (TypeScript strictness, ESM, Zod boundary validation, route/service separation, logging/telemetry rules, and “no dev bypass backdoor” constraints).

## Dev Agent Record

### Agent Model Used

GPT-5.2 (Codex CLI)

### Debug Log References

- Implementation plan: add server-side plan lookup and paywall routing guard in app loader; create ShopPlan persistence model/service; add paywall route and unit tests for plan/routing/tenancy helpers.
- Implementation plan: create standard-plan subscription flow with Shopify GraphQL, persist pending/active plan state, confirm on return URL, and grant $1 gift on activation with supporting schema/tests.
- Implementation plan: add invite-code validation, early access subscription flow with pending/activation state, generic error handling with delay, and tests for invite code + billing payloads.
- Implementation plan: add pino + PostHog wrappers and instrument paywall actions with snake_case props and correlation keys.
- Implementation plan: guard idempotent mutations for pending/active plans, add paywall view telemetry, and add idempotency key builders with unit tests.
### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- Implemented server-authoritative paywall gating with plan state lookup and paywall route; added ShopPlan persistence and unit tests for routing/plan access/tenancy.
- Added Standard plan subscription flow with return-url confirmation, plan persistence, $1 gift grant on activation, and billing payload tests.
- Added Early Access invite-code flow with case-sensitive validation, generic error handling and delay, early access subscription activation, and UI loading feedback.
- Added PostHog telemetry + pino logs for paywall subscribe/invite flows with correlation keys and no secret logging.
- Added paywall view telemetry, idempotency guards for pending/active plan states, and idempotency key builders/tests.

### File List

- `_bmad-output/implementation-artifacts/1-1-paywall-early-access-activation-invite-code.md`
- `app/routes/app.billing.confirm.tsx`
- `app/lib/idempotency.test.ts`
- `app/lib/idempotency.ts`
- `app/lib/invite-code.test.ts`
- `app/lib/invite-code.ts`
- `app/lib/logger.ts`
- `app/lib/posthog.server.ts`
- `app/lib/routing.test.ts`
- `app/lib/routing.ts`
- `app/lib/tenancy.test.ts`
- `app/lib/tenancy.ts`
- `app/routes/app.paywall.tsx`
- `app/routes/app.tsx`
- `app/schemas/admin.ts`
- `app/services/shopify/billing.server.test.ts`
- `app/services/shopify/billing.server.ts`
- `app/services/shops/plan.server.test.ts`
- `app/services/shops/plan.server.ts`
- `package.json`
- `pnpm-lock.yaml`
- `prisma/dev.sqlite`
- `prisma/migrations/20260112132916_add_shop_plans/migration.sql`
- `prisma/migrations/20260112133817_update_shop_plans_for_billing/migration.sql`
- `prisma/schema.prisma`
- `vite.config.ts`
