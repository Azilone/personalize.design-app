# Project Context

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

_Documented after discovery phase_

- Runtime: Node.js (pnpm) (engines: >=20.19 <22 || >=22.12)
- Language: TypeScript ^5.9.3
- Admin app: Shopify React Router template
  - react-router ^7.12.0
  - @shopify/shopify-app-react-router ^1.1.0
  - React ^18.3.1
- Data: Prisma ^6.16.3 (target upgrade: 7.2.0)
- DB/Storage: Supabase Postgres + Supabase Storage
- Async workflows: Inngest (target: 3.49.1)
- UI (storefront bundle): Tailwind (target: 4.1.18) + shadcn-style primitives + Zustand (target: 5.0.9)
- Observability: pino JSON logs to stdout (target: 10.1.1) + PostHog (posthog-node target: 5.20.0; posthog-js target: 1.318.1)

## Critical Implementation Rules

### Language-Specific Rules (TypeScript)

- TypeScript is `strict: true` (do not weaken TS config to “make it compile”).
- Keep ESM (`"type": "module"`); prefer `import`/`export` (no `require`).
- Use `async/await` for async control flow; don’t mix promise chains unless necessary.
- Use shared Zod schemas for boundary validation (server + storefront bundle); do not duplicate schema logic in multiple places.
- Keep internal TS identifiers idiomatic (`camelCase`), but map to/from `snake_case` at boundaries (DB + API payloads) and keep Prisma schema fields in `snake_case` per architecture decision.

### Framework-Specific Rules (Shopify + React Router)

- Keep the existing Shopify React Router template patterns; don’t introduce a second server framework or a parallel REST server.
- Shopify Admin API usage is GraphQL-only.
- Webhooks:
  - Always verify `X-Shopify-Hmac-Sha256` using the raw request body.
  - Handlers must be idempotent.
- App Proxy (storefront → backend):
  - Production storefront calls MUST go through App Proxy (no prod fallback).
  - Verify App Proxy `signature` on every proxy request.
  - Use `snake_case` payload fields on the wire.
- Dev-mode non-proxy path:
  - Allowed ONLY in development for local testing when App Proxy is blocked by dev-store password.
  - Must be gated (dev-only env flag + secret header + additional restriction like localhost/VPN/admin-session).
  - Must hard-fail if enabled outside development (no backdoor in Dokploy/prod).
- Storefront UI:
  - Use theme app extension block (Liquid) to mount the JS bundle (Tailwind + shadcn-style + Zustand).

### Testing Rules

- Don’t add a big testing framework “just because” during MVP; follow existing repo patterns first.
- When adding tests:
  - Co-locate `*.test.ts(x)` next to the module under test.
  - Prefer small unit tests for pure functions (schemas, idempotency key builders, payload mappers).
  - Add a few integration tests only for high-risk boundaries:
    - webhook HMAC verification
    - app proxy signature verification
    - billing ledger idempotency (no double-charge on retry)

### Code Quality & Style Rules

- Formatting: obey `.editorconfig` (2 spaces, trim whitespace; keep Markdown trailing spaces).
- TypeScript: keep `strict: true`; no `any` unless justified at boundaries.
- Linting: keep ESLint clean; don’t disable rules globally to “make it pass”.
- Naming conventions:
  - DB + API payloads: `snake_case`
  - PostHog event props: `snake_case`
  - Error envelope: `{ error: { code, message, details? } }`
- Keep route/service boundaries:
  - `app/routes/*` owns HTTP handling and calls services.
  - `app/services/*` owns third-party integrations and must not import routes.
- Logging:
  - Use pino JSON logs to stdout (structured, with correlation IDs).
  - Use PostHog for events + error telemetry; don’t log secrets/PII.

### Development Workflow Rules

- Deployment: production runs in Docker on a VPS managed by Dokploy; logs must go to stdout.
- Secrets/config:
  - Never commit secrets.
  - All third-party keys (Shopify, Supabase, PostHog, fal.ai, Printify) must come from env vars.
- Dev-only bypass (non-proxy): must never be enabled in Dokploy/prod; hard-fail if misconfigured.
- Migrations:
  - Use Prisma migrations; don’t apply manual DB changes without migrations.

### Critical Don’t‑Miss Rules

- Never ship a “dev bypass” endpoint without strict safeguards:
  - enabled only in development + requires secret header + extra restriction; hard-fail if enabled outside dev.
- Billing safety:
  - Bill ONLY after image is generated AND stored (provider cost incurred + asset persisted).
  - Use a `billable_events` ledger + stable `idempotency_key` to prevent double charges on retries.
- Webhooks + workflows:
  - Webhook handlers must be idempotent.
  - Inngest steps must define idempotency keys and be safe to retry.
- Storage security:
  - Supabase Storage must be private; access via signed URLs only.
  - Never expose Supabase service role key to the client/storefront bundle.
- Logging/telemetry:
  - Do not log secrets/PII; PostHog event props must be `snake_case` and include correlation keys (`shop_id`, `order_line_id`, `job_id`, etc).
- API errors:
  - Always return `{ error: { code, message, details? } }` on failure from proxy/web endpoints.

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code.
- Follow ALL rules exactly as documented.
- When in doubt, ask questions.
- Update this file if new patterns emerge.

Last Updated: 2026-01-10T18:13:16Z
