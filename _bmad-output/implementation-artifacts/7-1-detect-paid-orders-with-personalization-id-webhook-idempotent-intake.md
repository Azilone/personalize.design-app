# Story 7.1: Detect Paid Orders with personalization_id Webhook Idempotent Intake

Status: done

**Completion Note:** Ultimate context engine analysis completed - comprehensive developer guide created

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an operator,
I want the system to detect paid orders that include personalized line items,
So that fulfillment can start automatically and safely.

## Acceptance Criteria

**Given** Shopify sends an order "paid" webhook
**When** the system receives it
**Then** it verifies the webhook HMAC before processing
**And** it identifies order lines that include `personalization_id` in `line_item.properties[]` array

**Given** an eligible order line is found
**When** the system starts processing
**Then** it creates an idempotent processing record keyed by (`shop_id`, `order_line_id`)
**And** it triggers async workflow processing (Inngest) for that order line

**Given** the same webhook is delivered multiple times
**When** it is processed again
**Then** the system does not create duplicate fulfillment runs or duplicate billable events

**Given** the shop is on the **Standard** plan
**And** an eligible order line is found (has `personalization_id`)
**When** the async fulfillment workflow runs for an eligible order line
**Then** the system records a per-order fee billable event (`order_fee`) for that order line (**$0.25**) with an idempotency key
**And** it creates the corresponding Shopify Usage Charge via the Inngest workflow (to handle rate limits)

**Given** the shop is on **Early Access**
**When** the async fulfillment workflow runs for an eligible order line
**Then** the per-order fee is waived (creates `billable_event` with status `waived` for audit trail, no Shopify charge)

## Tasks / Subtasks

- [x] Register `orders/paid` webhook with Shopify (AC: 1)
  - [x] Use `shopify.registerWebhooks()` during app initialization or shop installation
  - [x] Configure webhook to use API version: `2025-10` (matches `shopify.server.ts`)
  - [x] Ensure webhook is registered before processing orders
- [x] Create Shopify webhook route handler for `orders/paid` event (AC: 1)
  - [x] Create route at `app/routes/webhooks/orders/paid/route.tsx` (matches existing webhook pattern)
  - [x] Use `authenticate.webhook(request)` which automatically verifies HMAC and returns `{ shop, topic, session }`
  - [x] Check `X-Shopify-Webhook-Id` to prevent immediate duplicate processing (Network Layer Idempotency)
  - [x] Parse webhook payload and extract order details
  - [x] Add request logging with correlation IDs
- [x] Implement order line scanning for `personalization_id` (AC: 1)
  - [x] Iterate through order line items from webhook payload
  - [x] Check `line_item.properties` array for entry where `name === 'personalization_id'`
  - [x] Extract `personalization_id` from `properties.find(p => p.name === 'personalization_id')?.value`
  - [x] Filter eligible lines for processing
- [x] Create idempotent processing record system (AC: 2, 3)
  - [x] Design `order_line_processing` table schema with idempotency key
    - [x] **Decision Note:** Separate from `BillableEvent` table because:
      - `BillableEvent` tracks billing state only (pending/confirmed/failed/waived)
      - `order_line_processing` tracks fulfillment workflow state independently
      - Operator visibility requires seeing fulfillment progress even before billing triggers
  - [x] Implement upsert logic for processing records
  - [x] Handle concurrent webhook deliveries safely
- [x] Implement Inngest workflow trigger (AC: 2)
  - [x] Create `fulfillment.processOrderLine` Inngest function
  - [x] Pass required context: shop_id, order_id, order_line_id, personalization_id
  - [x] Define idempotency key format: `{shop_id}:{order_line_id}:fulfillment`
- [x] Implement per-order fee billing (Async in Inngest) (AC: 4)
  - [x] Implement as a `step.run` in `fulfillment.processOrderLine`
  - [x] Check shop plan status before billing:
    - [x] `standard` → create order_fee billable event and charge $0.25
    - [x] `early_access` → create order_fee billable event with status `waived` (no Shopify charge)
    - [x] `standard_pending` / `early_access_pending` → waive fee (merchant not yet approved)
    - [x] `none` → waive fee and log warning (merchant has no subscription)
  - [x] Create `billable_events` record with `order_fee` type and appropriate status
  - [x] For `standard` plan: generate Shopify Usage Charge for $0.25 (handles rate limits via Inngest retries)
  - [x] Use idempotency key: `{shop_id}:{order_line_id}:order_fee`
- [x] Implement Early Access fee waiver (AC: 5)
  - [x] Create `billable_event` with status `waived` for Early Access shops
  - [x] Do NOT create Shopify Usage Charge for waived events
  - [x] Log fee waiver for audit trail
- [x] Add comprehensive error handling and logging
  - [x] Handle `X-Shopify-Webhook-Id` duplicates → return 200 OK immediately (idempotent)
  - [x] Handle database errors with retry logic
  - [x] Handle business logic errors (e.g., plan not found) → log and return 200 to prevent retries
  - [x] Handle partial failures (some lines processed, others not) → log errors but return 200
  - [x] Emit PostHog events for webhook processing outcomes (success, failure, duplicate, waived)

## Dev Notes

### Critical Architecture Requirements

**Webhook Security & Reliability:**

- Use `authenticate.webhook(request)` which automatically verifies `X-Shopify-Hmac-Sha256` header using raw request body [Source: AGENTS.md, Shopify React Router template]
- Check `X-Shopify-Webhook-Id` against database/cache to handle network-layer duplicates before business logic
- **HTTP Response Codes:**
  - `authenticate.webhook()` automatically returns `401 Unauthorized` for invalid HMAC (Shopify will retry)
  - Return `200 OK` for successful processing
  - Return `200 OK` for duplicate webhooks (idempotent - already processed)
  - Return `200 OK` for business logic errors (log error but don't retry webhook)
  - Return `500 Internal Server Error` only for unexpected system failures
- **NO EXTERNAL API CALLS** (like Billing) inside the webhook handler to prevent timeouts.

**Idempotency Pattern:**

- **Network Layer:** Filter by `X-Shopify-Webhook-Id`.
- **Business Layer:** Key format `{shop_id}:{order_line_id}:{step_name}`.
- Store in `order_line_processing` table with unique constraint on idempotency_key.
- Use database upsert to handle race conditions from concurrent webhook deliveries.

**Billing Safety:**

- Bill ONLY after successful order line detection and processing record creation.
- **MUST execute inside Inngest workflow** to handle Shopify API rate limits and retries gracefully.
- Use `billable_events` ledger with stable idempotency_key.
- Shopify Usage Charge must use same idempotency key to prevent double-charging.
- **Plan Status Billing Logic:**
  - `standard` → Create `order_fee` billable event (status: `pending`) + Shopify Usage Charge
  - `early_access` → Create `order_fee` billable event (status: `waived`) + NO Shopify charge
  - `standard_pending` / `early_access_pending` → Create `order_fee` billable event (status: `waived`) + NO Shopify charge
  - `none` → Create `order_fee` billable event (status: `waived`) + log warning + NO Shopify charge

**Async Workflow:**

- Trigger Inngest function immediately after processing record creation.
- Do NOT wait for workflow completion in webhook handler (return 200 quickly).
- Inngest handles retries and idempotency for fulfillment and billing steps.

### Project Structure Notes

**Route Configuration:**

Add the webhook route to `app/routes.ts` following the existing pattern:

```typescript
route(
  "webhooks/orders/paid",
  "./routes/webhooks/orders/paid/route.tsx",
),
```

This ensures the route is properly registered with the React Router app.

**New Files to Create:**

- `app/routes/webhooks/orders/paid/route.tsx` - Webhook handler route (follows existing pattern)
- `app/schemas/webhooks.ts` - Add orders/paid payload validation schema
- `app/inngest/functions/fulfillment.ts` - Fulfillment workflow trigger
- `prisma/migrations/` - Add `order_line_processing` and update `billable_events` table

**Files to Modify:**

- `app/routes.ts` - Add webhook route configuration
- `prisma/schema.prisma` - Add new models
- `app/services/shopify/billing.ts` - Add order fee billing function
- `app/services/posthog/events.ts` - Add webhook processing events

**Database Schema Additions:**

```prisma
model order_line_processing {
  id                String   @id @default(uuid())
  shop_id           String
  order_id          String
  order_line_id     String
  idempotency_key   String   @unique
  status            String   // pending, processing, succeeded, failed
  personalization_id String
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt

  @@index([shop_id, order_line_id])
  @@index([status])
}
```

### Key Technical Decisions

1. **HMAC Verification:** Use `authenticate.webhook(request)` from Shopify React Router template which automatically verifies HMAC using raw request body. No manual HMAC calculation needed.
2. **Idempotency:**
   - Layer 1: `X-Shopify-Webhook-Id` check (Network layer - prevents immediate duplicate processing).
   - Layer 2: Database upsert on business key `{shop_id}:{order_line_id}:{step_name}` (Business layer).
3. **Line Item Properties Access:** Use `lineItem.properties.find(p => p.name === 'personalization_id')?.value` - properties is an array of `{ name, value }` objects.
4. **Billing Timing:** Charge **asynchronously via Inngest** to avoid blocking webhook and to handle rate limits automatically.
5. **Plan Status Logic:** Create `billable_events` record for ALL eligible order lines:
   - `standard` → status `pending` + create Shopify Usage Charge
   - `early_access` / `*_pending` / `none` → status `waived` + NO Shopify charge
   - This ensures audit trail for all personalization activity regardless of plan.
6. **Table Design:** Use separate `order_line_processing` table for fulfillment state (independent from billing state in `BillableEvent`).
7. **Error Handling:** Log and emit events, but return 200 to Shopify to prevent retries for unrecoverable errors. Only return 401 for HMAC failures (though `authenticate.webhook()` handles this automatically).

### Integration Points

- **Shopify Webhooks:** Register `orders/paid` webhook using `shopify.registerWebhooks()` during app initialization
- **Inngest:** Use `inngest.send()` to trigger fulfillment workflow
- **Database:** Prisma for all data operations
- **Billing:** Shopify GraphQL API for Usage Charges (appUsageRecordCreate mutation)
- **Telemetry:** PostHog for event tracking

### References

- [Source: _bmad-output/planning-artifacts/epics.md#story-7.1] - Story requirements and acceptance criteria
- [Source: _bmad-output/planning-artifacts/architecture.md#webhooks] - Webhook HMAC verification requirements
- [Source: _bmad-output/planning-artifacts/architecture.md#billing-safety] - Billing safety and idempotency patterns
- [Source: _bmad-output/planning-artifacts/architecture.md#async-orchestration] - Inngest workflow patterns
- [Source: AGENTS.md] - Critical implementation rules (HMAC verification, snake_case, error envelopes)
- [Source: _bmad-output/planning-artifacts/prd.md#subscription-tiers--billing] - Plan types and billing rules

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- ✅ Implemented `orders/paid` webhook handler at `app/routes/webhooks/orders/paid/route.tsx` with full HMAC verification via `authenticate.webhook()`
- ✅ Created idempotent processing record system using `order_line_processing` table with unique idempotency_key constraint
- ✅ Implemented order line scanning for `personalization_id` in line item properties array
- ✅ Created Inngest fulfillment workflow (`fulfillment.processOrderLine`) for async processing
- ✅ Implemented per-order fee billing ($0.25) with plan status logic:
  - `standard` plan: Creates billable event + Shopify Usage Charge
  - `early_access`/`standard_pending`/`early_access_pending`/`none`: Creates waived billable event (no charge)
- ✅ Added comprehensive PostHog event tracking for webhook processing and billing
- ✅ Added webhook payload validation schemas with Zod
- ✅ Created database migration for `order_line_processing` table
- ✅ Updated sprint status to "review"

### File List

- `app/routes/webhooks/orders/paid/route.tsx` - Webhook handler for orders/paid events with HMAC verification, idempotency, and billing trigger
- `app/schemas/webhooks.ts` - Zod schemas for webhook payload validation
- `app/schemas/webhooks.test.ts` - Unit tests for webhook schemas
- `app/routes/webhooks/orders/paid/webhook.integration.test.ts` - Integration tests for webhook idempotency and billing
- `app/services/inngest/functions/fulfillment.ts` - Inngest function for async fulfillment workflow and order fee billing
- `app/services/inngest/index.server.ts` (modified) - Added fulfillment functions to Inngest exports
- `app/routes.ts` (modified) - Added webhook route registration
- `prisma/schema.prisma` (modified) - Added OrderLineProcessing model and order_fee to BillableEventType enum
- `prisma/migrations/20260129172008_add_order_line_processing/` - Database migration for new table
- `app/services/posthog/events.ts` (modified) - Added webhook processing and billing event tracking
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified) - Updated story status

## Previous Story Intelligence

### Learnings from Epic 6 Stories

From Story 6.6 (Add to Cart with personalization_id Metadata):

- `personalization_id` is stored in cart line item properties/metadata
- The ID links to the buyer's generated preview/session record
- Pattern: Use `personalization_id` as the correlation key between storefront and post-purchase

From Story 6.0-6.7 (Storefront Extension Pipeline):

- App Proxy pattern with signature verification is established
- Zustand state management for buyer session
- Inngest workflows for generation and mockups are already in place
- PostHog event naming convention: `domain.action` with snake_case properties

### Code Patterns Established

**Error Envelope Pattern (from AGENTS.md):**

```typescript
{ error: { code: string, message: string, details?: unknown } }
```

**Line Item Properties Pattern (from Shopify webhook payload):**

```typescript
// line_item.properties is an array of { name: string, value: string } objects
const personalizationId = lineItem.properties?.find(
  (p: { name: string }) => p.name === "personalization_id",
)?.value;

if (personalizationId) {
  // This line has personalization - trigger fulfillment workflow
}
```

**PostHog Event Pattern:**

```typescript
posthog.capture({
  event: "webhook.order_paid.received",
  properties: {
    shop_id: shopId,
    order_id: orderId,
    has_personalization: true,
    line_count: 3,
    processing_status: "processing" | "duplicate" | "failed",
  },
});
```

**Idempotency Key Pattern:**

```typescript
const idempotencyKey = `${shopId}:${orderLineId}:${stepName}`;
```

**Plan Status Billing Logic:**

```typescript
// Plan status values: 'none' | 'standard' | 'early_access' | 'standard_pending' | 'early_access_pending'
const shouldCharge = planStatus === "standard";
const shouldWaive = [
  "early_access",
  "standard_pending",
  "early_access_pending",
  "none",
].includes(planStatus);

if (shouldWaive) {
  // Create billable event with status: 'waived'
  // Do NOT create Shopify Usage Charge
} else if (shouldCharge) {
  // Create billable event with status: 'pending'
  // Create Shopify Usage Charge via appUsageRecordCreate
}
```

## Technical Requirements

### Required Libraries/Dependencies

- `@shopify/shopify-app-react-router` - For `authenticate.webhook()` (HMAC verification)
- `inngest` - For async workflow orchestration
- `@prisma/client` - For database operations
- `posthog-node` - For event telemetry

### API Endpoints

**Webhook Endpoint:**

- `POST /webhooks/orders/paid` - Shopify webhook handler
- Must return 200 OK quickly (do not block on async work)
- HMAC verification is automatic via `authenticate.webhook(request)` (Shopify React Router template)
- Uses Shopify API version: `2025-10` (matches `shopify.server.ts`)

**Error Response Codes:**

- `401 Unauthorized` - HMAC verification failed
- `200 OK` - Successful processing, duplicate webhook, or business logic error
- `500 Internal Server Error` - Unexpected system failure (should be rare with proper error handling)

### Database Requirements

**New Table: `order_line_processing`**

- Tracks processing state per order line
- Prevents duplicate processing
- Enables operator visibility into fulfillment status
- **Why separate from `BillableEvent`:**
  - `BillableEvent` tracks billing state only (pending/confirmed/failed/waived)
  - `order_line_processing` tracks fulfillment workflow state independently
  - Example: line might be "processing" in fulfillment workflow for days before billing triggers
  - Operator needs to see fulfillment progress regardless of billing status

**Modified Table: `billable_events`**

- Add `order_fee` event type
- Ensure idempotency_key unique constraint

### Security Requirements

- HMAC verification mandatory
- No sensitive data in logs or PostHog events
- Shop-scoped data access only
- Idempotency prevents duplicate billing

### Testing Considerations

**Unit Tests:**

- HMAC verification with valid/invalid signatures
- Idempotency key generation
- Plan type detection (Standard vs Early Access)

**Integration Tests:**

- End-to-end webhook processing
- Duplicate webhook delivery handling
- Billing record creation

**Manual Testing:**

- Trigger test order from Shopify
- Verify Inngest function receives event
- Check billing records in database

## Git Intelligence

### Recent Commits Pattern

Based on Epic 6 completion, recent work includes:

- Storefront extension build pipeline (Tailwind + Zustand + Vite)
- App Proxy endpoints for generation and mockups
- Inngest workflows for async processing
- PostHog event instrumentation

### Established Conventions

- **File naming:** `kebab-case` for routes and utilities
- **Function naming:** `camelCase` for implementations
- **Type naming:** `PascalCase` for interfaces and types
- **Database fields:** `snake_case` per Prisma schema convention
- **Error codes:** Stable, descriptive strings (e.g., `WEBHOOK_INVALID_HMAC`)

## Latest Technical Information

### Shopify Webhook Best Practices (2026)

- Webhooks should return 200 OK within 5 seconds
- Use async processing for heavy work
- Implement idempotency to handle duplicate deliveries
- Shopify may retry webhooks up to 19 times over 48 hours
- Webhook payload uses `line_items[].properties[]` array with `{ name, value }` objects
- HMAC verification is automatic via `authenticate.webhook(request)` which uses raw request body (not parsed JSON)

### Shopify API Version

- App uses `ApiVersion.October25` (from `shopify.server.ts`)
- Webhook registration should use same API version for consistency
- Order payload structure follows REST Admin API format with `line_items` (snake_case)

### Shopify Billing API

- Use `appUsageRecordCreate` mutation to create per-order fee charges
- Mutation requires: `subscriptionLineItemId`, `price` (MoneyInput), `description`, `idempotencyKey`
- Price precision: use 3 decimal places for amounts (e.g., `$0.250` for 25 cents)
- Usage charges only apply to `standard` plan with active subscription

### Inngest Patterns

- Use `inngest.createFunction()` for workflow definitions
- Define idempotency keys in event data
- Use `step.run()` for individual operations
- Return early from webhook handler, let Inngest handle retries

### Prisma Upsert Pattern for Idempotency

```typescript
await prisma.order_line_processing.upsert({
  where: { idempotency_key: key },
  create: {
    /* initial data */
  },
  update: {}, // No update on conflict - keeps first record
});
```

## Project Context Reference

### Related Stories

- **Story 6.6:** Add to Cart with personalization_id Metadata - Establishes how personalization_id is attached to cart items
- **Story 7.2:** Final Print-Ready Asset - Depends on this story for order line detection
- **Story 7.3:** Submit to Printify - Depends on this story for workflow trigger
- **Story 7.4:** Operator Reprocess - Uses same idempotency patterns

### Epic 7 Context

Epic 7 covers post-purchase fulfillment and operational reliability:

- 7.1: Detect paid orders (this story)
- 7.2: Final print-ready asset
- 7.3: Submit to Printify
- 7.4: Operator reprocessing

This story is the ENTRY POINT for all post-purchase processing. Without it, no fulfillment can occur.

### Billing Context

- **Standard Plan:** $19/month + $0.25 per order line + usage fees (AI generations)
- **Early Access:** $0/month, per-order fee waived (but `billable_events` still created with status `waived` for audit trail)
- **Standard/Early Access Pending:** Fee waived until merchant approves subscription
- **No Plan:** Fee waived with warning logged
- **Free Gift:** $1.00 AI usage credit (applies to generations, not order fees)
- **Usage Billing:** Via Shopify Usage Charges API (`appUsageRecordCreate` mutation)
- **Audit Trail:** All eligible order lines create `billable_events` records regardless of plan status

## Questions / Clarifications

1. **Q:** Should we process the entire order atomically or allow partial processing if some lines fail?
   **A:** Process each line independently - failure of one line should not block others

2. **Q:** What happens if the shop changes plans between order creation and webhook delivery?
   **A:** Use current plan at time of webhook processing (billing is charged when order is paid)

3. **Q:** Should we emit PostHog events for orders without personalization?
   **A:** Yes, emit `webhook.order_paid.received` with `has_personalization: false` for funnel analysis

4. **Q:** How do we handle webhook deliveries for orders already processed (e.g., after reprocess)?
   **A:** Idempotency key prevents duplicate processing - return 200 immediately if already processed

5. **Q:** Why do we need `order_line_processing` table if we have `BillableEvent`?
   **A:** They serve different purposes:
   - `BillableEvent` tracks billing state only (pending/confirmed/failed/waived)
   - `order_line_processing` tracks fulfillment workflow state independently
   - Operator visibility requires seeing fulfillment progress before billing triggers
   - Example: line might be "processing" in fulfillment workflow but billing hasn't started yet

6. **Q:** What happens when webhook payload has multiple lines with the same `personalization_id`?
   **A:** Each line is processed independently with its own `order_line_id` - same `personalization_id` is allowed and handled separately

7. **Q:** Should we retry Inngest workflow if initial trigger fails?
   **A:** Yes, Inngest handles automatic retries with exponential backoff - webhook handler should still return 200 to prevent Shopify retries

## Implementation Checklist

- [x] Prisma schema updated with new models
- [x] Migration created and tested
- [x] Webhook registered with Shopify (`orders/paid` topic)
- [x] Webhook route handler implemented with HMAC verification
- [x] Order line scanning logic implemented (properties array iteration)
- [x] Idempotency record system implemented (order_line_processing table)
- [x] Inngest fulfillment function created
- [x] Billing logic implemented for all plan statuses (standard/early_access/none/pending)
- [x] PostHog events added (success, failure, duplicate, waived)
- [x] Error handling and logging complete (all HTTP response codes defined)
- [x] Unit tests written
- [x] Integration tests written
- [ ] Manual testing completed with test orders

## Review Follow-ups (AI)

### Code Review (2026-01-29)

**HIGH Issues Fixed:**

- [x] **Integration Tests Written** - Created `app/routes/webhooks/orders/paid/webhook.integration.test.ts` with comprehensive test coverage:
  - Duplicate webhook delivery handling (network layer idempotency)
  - Billing record creation with idempotency
  - Order line processing state management (pending → processing → succeeded/failed)
  - Plan status billing logic (standard vs early_access vs none)
  - Webhook payload schema validation

- [x] **PostHog Event Naming Fix** - Fixed typo in `app/services/posthog/events.ts`:
  - Changed `usage_gift_grant` to `usage.gift.granted` (per `domain.action` pattern)
  - Location: events.ts:11

**MEDIUM Issues Fixed:**

- [x] **Network Layer Idempotency** - Implemented `X-Shopify-Webhook-Id` duplicate check in webhook handler:
  - Added webhook ID check before business logic processing
  - Returns 200 OK with `duplicate: true` for immediate duplicate webhooks
  - Location: route.tsx:208-238

- [x] **Inngest Idempotency Configuration** - Added `idempotency` option to `processOrderLine` function:
  - Prevents duplicate billing events on workflow retries
  - Location: fulfillment.ts:58

- [x] **Webhook Error Response Format** - Fixed error response to use standard envelope:
  - Changed from `{ error: "Invalid payload" }` to `{ error: { code: "WEBHOOK_INVALID_PAYLOAD", message: "...", details: ... } }`
  - Location: route.tsx:234-246

**LOW Issues (Noted but not blocking):**

- [ ] **Prisma Schema Status Enum** - `OrderLineProcessing.status` is `String` type (no enum constraint)
  - Recommendation: Add `OrderLineProcessingStatus` enum for data integrity
  - Location: schema.prisma:332

- [ ] **Webhook ID in Logs** - `X-Shopify-Webhook-Id` logged in clear text
  - Consider logging hash or removing from production logs
  - Location: route.tsx:165-172

**Additional Fixes:**

- [x] **Prisma Client Regenerated** - Ran `npx prisma generate` after migration to fix TypeScript types
