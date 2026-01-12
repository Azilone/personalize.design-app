---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
---

# personalize-design-app - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for personalize-design-app, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

```
FR1: Merchant can install the app and complete onboarding for their shop.
FR2: Merchant can activate Early Access using an invite code.
FR3: Merchant can view required prerequisites and setup status (e.g., supplier connection, storefront block enabled).
FR4: Merchant can configure default spend controls for their shop (caps/limits).
FR5: Merchant can create a design template with defined buyer inputs (photo required; optional text).
FR6: Merchant can configure a design template’s generation configuration (e.g., model choice and cost visibility).
FR7: Merchant can test-generate outputs for a design template before publishing/using it.
FR8: Merchant can capture quality feedback on test outputs (e.g., thumbs up/down).
FR9: Merchant can manage (list/view/update/disable) design templates.
FR10: Merchant can keep a design template in a non-live state (draft/test-only) and then publish/unpublish it for storefront use.
FR11: Merchant can assign one or more design templates to a Shopify product.
FR12: Merchant can unassign design templates from a product.
FR13: Merchant can define which design templates are available to buyers for a product (e.g., enabled/disabled list).
FR14: Buyer can open the personalization experience on a product page where the app is enabled.
FR15: Buyer can upload a photo as part of personalization.
FR16: Buyer can optionally provide text input when enabled by the selected design template.
FR17: Buyer can select a design template when multiple are available for the product.
FR18: Buyer can request generation and receive a generated design image.
FR19: System can generate and provide secure access to generated images for buyer preview during the session.
FR20: Buyer can preview the generated design on a product mockup.
FR21: Buyer can regenerate a design within merchant-configured limits.
FR22: Buyer can add the product to cart with personalization metadata attached to the line item.
FR23: Buyer can see clear messaging when they reach limits or when billing/spend policies affect further generations.
FR24: Merchant can enable/disable the storefront personalization experience for their shop.
FR25: Merchant can enable/disable personalization per product (or per assigned design template) without uninstalling the app.
FR26: System can grant an initial free AI usage gift on plan activation (one-time, USD-denominated).
FR27: System can track AI usage per shop and per buyer session.
FR28: System can enforce a per-product generation limit.
FR29: System can enforce a per-session generation limit.
FR30: System can prevent paid AI usage until the merchant has explicitly consented to paid usage beyond the free usage gift.
FR31: Merchant can explicitly configure and confirm spend settings required for billing safety (capped amount + paid-usage consent status).
FR32: Merchant can review current usage and estimated charges (at least at a basic level) for their shop.
FR33: System can record an auditable history of billable events (generations and successful fulfilled orders).
FR34: Merchant can connect, verify, and manage the supplier account integration used for fulfillment (MVP: Printify).
FR35: Merchant can map/configure which supplier shop/account is used for fulfillment for their Shopify shop (MVP: Printify).
FR36: System can detect paid orders that include personalization metadata.
FR37: System can produce a final print-ready image asset per personalized order line.
FR38: System can submit fulfillment requests to the configured supplier for eligible paid orders (MVP: Printify).
FR39: System can track fulfillment job status per order line (pending/succeeded/failed).
FR40: Merchant (or operator) can see when an order cannot be fulfilled automatically and why.
FR41: System can provide a secure way to access final print-ready assets for an order line (at least for operator/merchant retrieval in MVP).
FR42: System can retry failed asynchronous operations safely without duplicating outcomes.
FR43: System can ensure idempotent handling of “paid order” processing so the same order line is not processed twice.
FR44: Operator (you) can reprocess a failed job (generation/mockup/fulfillment) for a given order line.
FR45: Operator (you) can inspect logs/diagnostics for a generation or fulfillment attempt sufficient to troubleshoot.
FR46: System can surface a clear failure state and recovery guidance when generation or fulfillment fails.
FR47: Merchant can view and accept baseline policies related to acceptable use and copyright responsibilities.
FR48: System can support reporting/flagging of potential policy violations for follow-up (manual process acceptable in MVP).
```

### NonFunctional Requirements

```
NFR1: The storefront experience supports a p95 “time-to-first-preview-image” of **≤ 20 seconds** (model-dependent budget; measured continuously).
NFR2: The system measures generation latency and errors and can surface basic performance indicators for troubleshooting (operator-level visibility is sufficient for MVP).
NFR3: The system uses safe retry and idempotency patterns for asynchronous workflows so that transient failures do not create duplicated orders or duplicated billable events.
NFR4: When a generation, mockup, or fulfillment step fails, the system leaves the order line in a clear recoverable state with sufficient diagnostics to support manual intervention (solo-operator friendly).
NFR5: All network communication uses TLS (in transit encryption).
NFR6: Sensitive data is protected at rest (credentials/secrets not stored in plaintext).
NFR7: Webhooks from external platforms are verified before processing.
NFR8: Customer-uploaded and generated assets are accessed via time-limited, scoped URLs (no public buckets).
NFR9: The system enforces basic abuse controls on public endpoints (rate limiting / throttling) to reduce cost and denial-of-service risk.
NFR10: The system produces security-relevant audit logs for billable actions (generation and fulfillment triggers) sufficient to investigate disputes.
NFR11: External dependency failures (Shopify, Printify, fal.ai, storage) are handled gracefully with retries where safe and clear error surfacing where not.
NFR12: The integration layer is designed to allow swapping/adding suppliers and sales platforms post-MVP without rewriting the core product workflows (provider-agnostic direction).
```

### Additional Requirements

- Starter/template: use the Shopify App Template – React Router (already in-use in this repo) for the embedded admin + storefront extension architecture.
- Data/persistence: use Prisma + Supabase managed Postgres; apply Prisma migrations from `prisma/migrations`.
- Object storage: use Supabase Storage for uploads, generated previews, and print-ready outputs; keep buckets private and serve assets via time-limited signed URLs (no client-side service keys).
- Storefront backend access: production storefront traffic uses App Proxy only (App Proxy-first); allow a dev-only non-proxy path due to dev-store password constraints.
- Webhook/security: verify Shopify webhook HMAC (`X-Shopify-Hmac-Sha256`) for all webhook routes; signature-verify App Proxy requests.
- Naming/contracts: use `snake_case` field names for DB + API payloads and a standard JSON error envelope with stable error codes.
- Async workflows: use Inngest for generation/mockups/fulfillment, retries, and reprocessing; define idempotency keys per step (typically `shop_id` + `order_line_id` + step).
- Billing safety: record billable events via a `billable_events` ledger with stable `idempotency_key`; retries/reprocessing must reuse idempotency keys to prevent duplicate charges; emit billing state transition events with correlation keys.
- Observability/telemetry: use `pino` JSON logs to stdout plus PostHog event telemetry and error tracking; avoid sensitive payloads/PII in PostHog properties.
- Accessibility: target WCAG 2.1 AA for admin + storefront.
- Storefront UX layout: desktop uses an embedded stepper inside the Shopify product-page block; mobile uses a full-screen stepper; tablet is touch-first with generous tap targets.
- Storefront UX states: post-generation result makes the preview the hero with **Add to cart** as primary and **Try again** as secondary; always show tries remaining + reset window messaging (no dead ends).
- Loading UX: use progress + short status text and prefer skeletons/reserved preview area to keep layout stable during generation.
- Error UX: calm, trust-preserving copy with deterministic recovery action (“Try again”).
- Mockup preview: a modal is acceptable for mockup preview on desktop; it is focus-trapped, ESC-dismissible, and informational only (does not gate add-to-cart).
- Responsive breakpoints: Mobile 320–767px, Tablet 768–1023px, Desktop 1024px+ (mobile-first CSS).
- Accessibility details: keyboard navigation, visible focus rings, semantic HTML/screen reader semantics, minimum 44×44px touch targets; ensure merchant accent color theming derives accessible contrast.

### FR Coverage Map

### FR Coverage Map

FR1: Epic 1 - Install + onboarding
FR2: Epic 1 - Early Access invite code
FR3: Epic 1 - Prerequisites/setup readiness (incl. storefront block/app embed)
FR4: Epic 5 - Spend safety defaults (caps/limits) + billing consent
FR5: Epic 3 - Create template + buyer inputs
FR6: Epic 3 - Generation configuration (model/cost visibility)
FR7: Epic 3 - Test-generate outputs
FR8: Epic 3 - Quality feedback on outputs (thumbs up/down)
FR9: Epic 3 - Manage templates (list/view/update/disable)
FR10: Epic 3 - Draft/test-only + publish/unpublish
FR11: Epic 4 - Assign template(s) to product (MVP uses single assigned template per product)
FR12: Epic 4 - Unassign templates from product
FR13: Epic 9 (Post-MVP) - Control which templates are available to buyers per product
FR14: Epic 6 - Open storefront personalization experience
FR15: Epic 6 - Upload photo
FR16: Epic 6 - Optional text input (when enabled by template)
FR17: Epic 9 (Post-MVP) - Buyer selects template when multiple available
FR18: Epic 6 - Request generation and receive generated design image
FR19: Epic 6 - Secure access to generated images for preview
FR20: Epic 6 - Preview on product mockups
FR21: Epic 6 - Regenerate within limits
FR22: Epic 6 - Add to cart with personalization metadata attached
FR23: Epic 6 - Clear messaging for limits/spend/billing impacts
FR24: Epic 1 - Shop-level enable/disable storefront personalization
FR25: Epic 4 - Enable/disable personalization per product (or assignment)
FR26: Epic 5 - Initial free AI usage gift granted on plan activation
FR27: Epic 5 - Track AI usage per shop and per buyer session
FR28: Epic 5 - Enforce per-product generation limit
FR29: Epic 5 - Enforce per-session generation limit
FR30: Epic 5 - Prevent paid AI usage until merchant consents beyond free usage gift
FR31: Epic 5 - Configure/confirm spend settings (capped amount + consent)
FR32: Epic 5 - Review current usage and estimated charges
FR33: Epic 5 - Auditable billable events history
FR34: Epic 2 - Connect/manage Printify integration
FR35: Epic 2 - Map supplier shop/account used for fulfillment
FR36: Epic 7 - Detect paid orders with personalization metadata
FR37: Epic 7 - Produce final print-ready asset per order line
FR38: Epic 7 - Submit fulfillment requests to supplier (Printify)
FR39: Epic 7 - Track fulfillment job status per order line
FR40: Epic 7 - Show when order can't be fulfilled automatically + why
FR41: Epic 7 - Secure access to final print-ready assets
FR42: Epic 7 - Safe retries for async operations without duplicates
FR43: Epic 7 - Idempotent paid-order processing per order line
FR44: Epic 7 - Operator reprocess failed jobs
FR45: Epic 7 - Operator diagnostics/log access
FR46: Epic 7 - Clear failure state + recovery guidance
FR47: Epic 8 - Policy acceptance
FR48: Epic 8 - Reporting/flagging for follow-up

## Epic List

### Epic 1: Merchant Onboarding & Shop Setup
Merchant can install, unlock Early Access (invite-only) or subscribe to Standard, see setup readiness (incl. app embed/storefront block), and enable/disable storefront personalization for their shop.
**FRs covered:** FR1, FR2, FR3, FR24

### Epic 2: Supplier Connection (Printify) Setup
Merchant can connect, verify, and manage Printify integration, and map/configure which Printify shop/account is used for fulfillment.
**FRs covered:** FR34, FR35

### Epic 3: Design Templates (“Blueprints”) — Create, Test, Publish, Manage (+ Remove BG)
Merchant can create templates (buyer inputs + generation configuration), test-generate outputs, capture quality feedback, manage templates, and publish/unpublish for storefront use; Remove BG is included in MVP scope.
**FRs covered:** FR5, FR6, FR7, FR8, FR9, FR10

### Epic 4: Product Setup — Sync Shopify Products, Assign Template, Merchant Preview
Merchant can sync/select Shopify products and assign/unassign a template to a product, enable/disable personalization per product, and validate the end-to-end listing experience via a merchant preview/simulator.
**FRs covered:** FR11, FR12, FR25

### Epic 5: AI Usage, Limits, Spend Safety, Billing
System grants an initial free AI usage gift (Early Access + Standard), tracks AI usage, enforces per-product and per-session limits, gates paid usage behind explicit merchant consent and spend settings (incl. capped amount), supports basic usage and estimated charges visibility, and records an auditable billable-events history; per-order fee is charged on Standard and waived on Early Access.
**FRs covered:** FR4, FR26, FR27, FR28, FR29, FR30, FR31, FR32, FR33

### Epic 6: Storefront Buyer Personalization (Single Template MVP)
Buyer can open the personalization stepper, upload a photo (and optional text when enabled), request generation, securely preview the result on mockups, regenerate within limits, and add to cart with personalization metadata; buyer sees clear messaging when reaching limits or when spend/billing policies affect generation.
**FRs covered:** FR14, FR15, FR16, FR18, FR19, FR20, FR21, FR22, FR23

### Epic 7: Post‑Purchase Fulfillment + Reliability, Recovery, and Ops
System detects paid orders with personalization metadata, produces print-ready assets per order line, submits/monitors fulfillment with Printify, surfaces failures with reasons, provides secure access to print-ready assets, and supports safe retries/idempotency plus operator reprocessing and diagnostics.
**FRs covered:** FR36, FR37, FR38, FR39, FR40, FR41, FR42, FR43, FR44, FR45, FR46

### Epic 8: Compliance Baselines
Merchant can view and accept baseline policies, and the system supports reporting/flagging potential violations for follow-up.
**FRs covered:** FR47, FR48

### Epic 9 (Post-MVP): Multi-Template Choice on Storefront
Buyer can choose between multiple design templates available for a product, and the merchant can control which templates are available.
**FRs covered:** FR13, FR17

## Epic 9 (Post-MVP): Multi-Template Choice on Storefront

Enable multi-template assignment per product and allow buyers to choose between available templates on storefront (post-MVP).

<!-- Repeat for each epic in epics_list (N = 1, 2, 3...) -->

## Epic 1: Merchant Onboarding & Shop Setup

Merchants can unlock Early Access (invite-only) or subscribe to the Standard plan, understand setup readiness (incl. app embed/storefront block + Printify status), and enable/disable storefront personalization for their shop.

### Story 1.1: Paywall + Early Access Activation (Invite Code)

As a merchant,
I want to see the default pricing paywall and either subscribe to the Standard plan or unlock Early Access with an invite code,
So that I can access the product and understand pricing clearly.

**Acceptance Criteria:**

**Given** a shop opens the embedded admin app and does not have Early Access activated
**When** they arrive in the app
**Then** they see a paywall showing the default pricing (**$19/month + $0.25 per successful personalized order line**)
**And** they cannot access the rest of the app until they unlock access
**And** the paywall offers:
- a “Subscribe” CTA (Standard plan)
- an “Invite code” field + “Unlock Early Access” CTA
**And** the paywall clearly states:
- Standard includes a **7-day free trial** for the $19/month access fee
- Standard and Early Access both include a one-time **$1.00 free AI usage gift**

**Given** the merchant clicks “Subscribe”
**When** they confirm the subscription in Shopify
**Then** the system activates the **Standard** plan for that shop (**$19/month**)
**And** the system creates a Shopify app subscription for the shop with recurring price **$19/month** and a **7-day free trial** (so Shopify Usage Charges can be used)
**And** the system grants a **$1.00 USD free AI usage gift** to the shop and shows this in the billing UI
**And** the UI clarifies the 7-day trial applies only to the **$19/month** access fee (it does not waive AI usage charges or the $0.25/order line fee)
**And** the merchant is redirected into onboarding/dashboard

**Given** the merchant enters the invite code `EARLYACCESS` (case-sensitive)
**When** they submit the form
**Then** the system activates **Early Access** for that shop (**$0/month** access; per-order fee waived during Early Access)
**And** the system creates a Shopify **subscription** for the shop with recurring price **$0/month** (so Shopify Usage Charges can be used)
**And** the system grants a **$1.00 USD free AI usage gift** to the shop and shows this in the billing UI
**And** the UI clearly indicates the shop is in **Early Access** (privileged state)
**And** the merchant is redirected into onboarding/dashboard

**Given** the merchant enters any other code
**When** they submit the form
**Then** the shop remains on the paywall
**And** an error message is shown (generic; does not reveal whether a code exists)
**And** the UI shows a fake loading state for ~3 seconds before responding (basic anti-bruteforce friction)


### Story 1.2: Onboarding Dashboard + Setup Readiness Checklist

As a merchant,
I want an onboarding dashboard that shows my setup readiness status,
So that I can quickly understand what’s blocking me from going live.

**Acceptance Criteria:**

**Given** the shop has activated Early Access or subscribed to Standard
**When** the merchant opens the app
**Then** they land on an onboarding/dashboard screen that summarizes setup readiness

**Given** the onboarding/dashboard is shown
**When** the merchant views the “Setup checklist”
**Then** they can see a clear status for each prerequisite item (e.g., `Complete` / `Incomplete`)
**And** the checklist includes at least:
- Printify connection status (connected vs not connected)
- Storefront personalization status (enabled vs disabled at shop level)
- Spend safety status (monthly cap configured + paid usage consent recorded vs not configured)
- Plan status (Early Access active)

**Given** a checklist item is incomplete
**When** the merchant views it
**Then** the UI shows a short “what to do next” hint (onboarding content like roadmap/video is nice-to-have)

### Story 1.3: Spend Safety Onboarding (Routing + Disclosure)

As a merchant,
I want onboarding to clearly explain spend safety and route me to configure it,
So that I understand the pricing and can avoid surprise charges.

**Acceptance Criteria:**

**Given** the merchant is in onboarding and spend safety is not configured
**When** they open the “Spend safety” step
**Then** the app shows the following billing disclosure clearly (no ambiguity):
- “You start with a **$1.00 USD free AI usage gift**.”
- “Current pricing (USD): **$0.05** per generated image; **$0.025** per remove background operation.”
- “Billable actions: **generate**, **regenerate**, **remove background**.”
- “Printify mockup generation is **not** billed.”
- “After the gift is used, usage is billed via **Shopify Usage Charges**.”
- “You will **not be charged** unless you **enable paid usage**.”
- “Your **monthly spending cap** limits the maximum amount that can be charged in a month.”

**Given** the spend safety step is shown
**When** the merchant clicks “Configure spend safety”
**Then** they are taken to the Billing/Spend Safety settings screen (Epic 5)

**Given** the merchant returns to onboarding after configuring spend safety
**When** the checklist is rendered
**Then** the “Spend safety” item is `Complete` only if:
- a valid monthly cap is configured
- paid usage consent is recorded (audit timestamp)

### Story 1.4: Confirm Storefront Personalization Status (Required Onboarding Step)

As a merchant,
I want to explicitly enable or keep disabled the storefront personalization experience for my shop,
So that I control whether buyers can access personalization on my storefront.

**Acceptance Criteria:**

**Given** the merchant is completing onboarding
**When** they reach the “Storefront personalization” step
**Then** the app shows a shop-level setting with a clear choice to **Enable** or **Keep disabled**
**And** the default state is **Disabled** until the merchant explicitly enables it

**Given** the merchant tries to finish onboarding without explicitly confirming this setting
**When** they attempt to proceed
**Then** onboarding is blocked
**And** the “Storefront personalization” checklist item remains `Incomplete`

**Given** the merchant explicitly enables storefront personalization
**When** they confirm
**Then** the system checks spend safety prerequisites (monthly cap configured + paid usage consent recorded)
**And** if prerequisites are not met, enabling is blocked with a clear message and a link to configure spend safety
**And** if prerequisites are met, the system saves `storefront_personalization_enabled = true` for the shop
**And** the “Storefront personalization” checklist item becomes `Complete`
**And** the UI clarifies that storefront personalization may still require additional setup (e.g., templates assigned to products) before buyers can successfully generate

**Given** the merchant explicitly keeps storefront personalization disabled
**When** they confirm
**Then** the system saves `storefront_personalization_enabled = false` for the shop
**And** the “Storefront personalization” checklist item becomes `Complete`

## Epic 2: Supplier Connection (Printify) Setup

Merchants can connect, verify, and manage a Printify integration for their shop, and map which Printify shop/account is used for fulfillment and mockups.

### Story 2.1: Connect Printify via API Token (Validate + Status)

As a merchant,
I want to connect my Printify account via an API token,
So that the app can generate mockups and automate fulfillment later.

**Acceptance Criteria:**

**Given** the merchant opens the Printify integration screen
**When** they paste a Printify API token and click “Connect”
**Then** the system validates the token by calling Printify
**And** if valid, saves the integration for the shop (token stored securely) and shows status `Connected`

**Given** the token is invalid/expired
**When** the merchant clicks “Connect”
**Then** the integration is not saved
**And** the UI shows a clear error and remains `Not connected`

**Given** the shop is connected to Printify
**When** the merchant returns to the integration screen
**Then** they see `Connected` status and basic account/shop info (enough to confirm it’s the right account)

**Given** the shop is not connected to Printify
**When** the merchant tries to access flows that require Printify (e.g., product setup preview/mockups/fulfillment-related actions)
**Then** the app blocks that action and shows “Connect Printify first” with a link to the integration screen
**And** template creation/testing remains available without Printify

### Story 2.2: Select Printify Shop/Account for This Shopify Shop

As a merchant,
I want to select which Printify shop/account to use for my Shopify shop,
So that fulfillment and mockups run against the correct Printify context.

**Acceptance Criteria:**

**Given** the shop is connected to Printify
**When** the merchant opens the Printify settings page
**Then** the app fetches and displays the list of available Printify shops/accounts for that token

**Given** the merchant selects one Printify shop/account and saves
**When** they confirm
**Then** the system stores the mapping (`shop_id` → `printify_shop_id`)
**And** the UI shows the selected shop/account as “Active”

**Given** no Printify shop/account is selected yet
**When** the merchant tries to use a Printify-required flow
**Then** the app blocks the action and prompts them to select a Printify shop/account

**Given** the Printify token is rotated/changed later
**When** the stored `printify_shop_id` is no longer available
**Then** the mapping is cleared and the merchant is prompted to re-select

### Story 2.3: Manage Printify Integration (Status, Rotate Token, Disconnect)

As a merchant,
I want to manage my Printify integration,
So that I can keep it working and fix issues without support.

**Acceptance Criteria:**

**Given** the shop is connected to Printify
**When** the merchant views the integration screen
**Then** they can see current connection status and the selected Printify shop/account (if set)

**Given** the merchant rotates their Printify token
**When** they update the token in the app and save
**Then** the app validates the new token and replaces the stored token securely
**And** if the previously selected `printify_shop_id` is no longer valid, the app prompts the merchant to re-select

**Given** the merchant disconnects Printify
**When** they confirm disconnect
**Then** the stored token is removed and status becomes `Not connected`
**And** Printify-required flows become blocked until reconnected

## Epic 3: Design Templates (“Blueprints”) — Create, Test, Publish, Manage (+ Remove BG)

Merchants can create and manage reusable design templates (“Blueprints”) that define buyer inputs, prompt configuration, and generation settings; they can test-generate outputs with cost/time visibility, capture quality feedback, and publish templates for storefront use.

### Story 3.1: Create Design Template with Prompt Variables (Draft)

As a merchant,
I want to create a design template with prompt variables,
So that I can produce consistent “premium” outputs while letting buyers personalize some parts.

**Acceptance Criteria:**

**Given** the merchant opens “Create template”
**When** they enter a template name, define buyer inputs (photo required; optional text toggle), and add one or more text variables (e.g., `animal`, `color`)
**Then** the template can be saved in a **Draft** state

**Given** the merchant defines prompt variables
**When** they configure the template prompt
**Then** they can reference variables inside the prompt using `{{variable_name}}`
**And** the system validates that all referenced variables exist

**Given** the merchant adds variables
**When** they save
**Then** variable names must be unique and non-empty (text variables only in MVP)
**And** invalid variable definitions show clear validation errors and are not saved

**Given** the merchant edits an existing Draft template
**When** they update name/inputs/variables/prompt
**Then** changes are saved and reflected consistently in the template

### Story 3.2: Model Selector (1 option) + Cost Visibility (Seedream v4 Edit)

As a merchant,
I want to see which generation model is used and what it costs in USD,
So that I understand the pricing before running generations.

**Acceptance Criteria:**

**Given** the merchant edits a Draft template
**When** they open “Generation settings”
**Then** they see a model selector
**And** in MVP it contains exactly one option: `fal-ai/bytedance/seedream/v4/edit`

**Given** the model option is shown
**When** the merchant views pricing info
**Then** the UI shows: “**$0.05 per generated image**” (or the current model price)
**And** the UI clarifies what is billable: generate/regenerate/remove-bg (Printify mockups are not billed)

**Given** the merchant saves the template
**When** generation settings are present
**Then** the template stores the model identifier and `price_usd_per_generation = 0.05`

### Story 3.3: Test Generate (1–4) + Results Gallery (Cost + Time)

As a merchant,
I want to test-generate multiple outputs for a template and see cost/time per output,
So that I can validate quality before publishing.

**Acceptance Criteria:**

**Given** the merchant is viewing a Draft template
**When** they open the “Test” section
**Then** they can upload/select a test photo input
**And** they can optionally enter test text (only if the template has text input enabled)
**And** they can set “Number of images” from **1 to 4**

**Given** the merchant selects `N` images (1–4)
**When** the UI shows the estimated cost
**Then** it displays estimated cost in USD (e.g., `$0.05 × N`) clearly before running

**Given** the merchant starts test generation
**When** generation is running
**Then** the UI shows a progress state
**And** on completion it shows a results gallery of the generated images

**Given** results are displayed
**When** the merchant views each generated image
**Then** the UI shows per-image generation metadata including:
- generation time (seconds)
- cost (USD)

**Given** the generation fails (timeout/provider error)
**When** the UI shows the error
**Then** it provides a deterministic recovery action (“Try again”)
**And** it does not publish the template automatically

### Story 3.4: Template-Level Remove Background ($0.025)

As a merchant,
I want to enable “Remove Background” for a template,
So that uploaded photos are cleaned automatically before generation.

**Acceptance Criteria:**

**Given** the merchant edits a Draft template
**When** they enable the “Remove Background” checkbox
**Then** the setting is saved on the template as enabled

**Given** “Remove Background” is enabled on the template
**When** the UI displays pricing for a generation run
**Then** the estimated cost includes the tool cost: `+ $0.025` (per image where applied)
**And** total is shown as: `(generation_cost_usd × N) + (remove_bg_cost_usd × N)`

**Given** the merchant runs test generation for `N` images
**When** Remove Background is enabled
**Then** the system applies background removal to the input photo before generation
**And** the per-image metadata includes tool usage and total cost

### Story 3.5: Publish/Unpublish Templates + Templates List (Draft/Published)

As a merchant,
I want to publish or unpublish templates and manage them in a list,
So that I can control what’s available for product assignment and storefront use.

**Acceptance Criteria:**

**Given** the merchant views the templates list
**When** templates exist
**Then** they see each template’s name and status (`Draft` or `Published`)

**Given** a template is in Draft
**When** the merchant clicks “Publish” and confirms
**Then** the template status becomes `Published`
**And** it becomes selectable for product assignment

**Given** a template is Published
**When** the merchant clicks “Unpublish” and confirms
**Then** the template status becomes `Draft`
**And** it is no longer available for new product assignment

**Given** the merchant opens a template from the list
**When** they edit and save
**Then** the changes persist and the status remains unchanged unless they publish/unpublish

## Epic 4: Product Setup — Sync Shopify Products, Assign Template, Merchant Preview

Merchants can select Shopify products from their existing catalog, assign a single published template per product (MVP), enable/disable personalization per product, and validate setup via a merchant preview/simulator.

### Story 4.1: Sync Shopify Products + Select Product to Configure

As a merchant,
I want to sync and select a Shopify product from my existing catalog,
So that I can configure personalization without creating listings in the app.

**Acceptance Criteria:**

**Given** the merchant opens the Products page
**When** they click “Sync products”
**Then** the app fetches products from Shopify and displays them in a list

**Given** products are listed
**When** the merchant selects a product
**Then** they enter a product configuration view for that product

**Given** the merchant returns later
**When** products have already been synced
**Then** the list loads without requiring a manual re-sync (but re-sync is available)

### Story 4.2: Assign Single Template to Product + Explicit Enable (MVP)

As a merchant,
I want to assign one published template to a product and explicitly enable personalization,
So that I control exactly when a product becomes personalizable.

**Acceptance Criteria:**

**Given** the merchant is on a product configuration view
**When** they view template assignment
**Then** they can select exactly **one** `Published` template to assign (MVP constraint)
**And** the UI shows a disabled “Multiple templates” control labeled **Coming soon** (post-MVP)

**Given** no template is assigned
**When** the merchant views product personalization status
**Then** personalization is `Disabled`
**And** enabling is not allowed until a template is assigned

**Given** the merchant assigns a template
**When** they save
**Then** the assignment is stored for that product
**And** personalization remains `Disabled` until the merchant explicitly enables it

**Given** a template is assigned
**When** the merchant toggles “Enable personalization for this product” ON and saves
**Then** the product-level personalization setting becomes enabled

**Given** the merchant unassigns the template
**When** they save
**Then** personalization is automatically set to `Disabled` for that product

### Story 4.3: Merchant Product Preview Simulator (Only When Configured)

As a merchant,
I want to preview the product page personalization experience from the admin,
So that I can validate the setup before buyers see it.

**Acceptance Criteria:**

**Given** the product has a template assigned and personalization is enabled for that product
**When** the merchant clicks “Preview”
**Then** the app shows an admin preview panel that displays:
- product info fetched from Shopify
- a way to run the same generation + mockup workflow used on storefront (same APIs/workflows), without add-to-cart
- the generated preview image (hero)
- a “Preview” button that opens a modal with all Printify-generated mockups (non-blocking)

**Given** the product is not fully configured (no template assigned or personalization disabled)
**When** the merchant clicks “Preview”
**Then** the app blocks preview and explains what is missing

## Epic 5: AI Usage, Limits, Spend Safety, Billing

The system grants an initial free AI usage gift, tracks AI usage and paid usage charges via Shopify Usage Charges, enforces per-product and per-session limits, gates paid usage behind explicit merchant consent, and enforces a monthly spend cap with explicit cap changes; it also provides usage visibility and an auditable billable-events history.

### Story 5.1: Usage Ledger + $1 Free AI Usage Gift

As a merchant,
I want to receive a free usage gift and see my balance and pricing clearly,
So that I can test the product and understand future costs.

**Acceptance Criteria:**

**Given** a shop activates Early Access or subscribes to Standard
**When** the app provisions billing/usage tracking for the shop
**Then** the system grants a one-time **$1.00 USD free AI usage gift** to the shop
**And** the system records the grant in an auditable ledger (USD amounts)

**Given** the merchant views the billing/usage screen
**When** the system shows their balance
**Then** it displays:
- remaining free usage gift balance (USD)
- paid usage spend month-to-date (if any)
- current prices for billable actions (USD)
- a note that the free gift is applied first before any paid charges (partial coverage is allowed)
- a note that billable actions are billed via Shopify Usage Charges after the gift is used (generate/regenerate/remove-bg)
- a note that Printify mockups do not consume billable AI usage
**And** if the shop is on Standard, it shows the subscription trial status (e.g., “7-day free trial active”) and clarifies this does not waive usage or per-order fees

### Story 5.2: Spend Safety Setup (Monthly Cap + Paid Usage Consent)

As a merchant,
I want to set a monthly cap and explicitly consent to paid usage,
So that there are no surprise charges and I stay in control of spend.

**Acceptance Criteria:**

**Given** the shop has not configured spend safety
**When** the merchant opens Billing/Spend Safety settings
**Then** the app shows:
- a cap input pre-filled with **$10.00 USD**
- a clear disclosure: “After the free $1 gift, usage is billed via Shopify Usage Charges (USD)”
- a required consent control (checkbox + confirm CTA)

**Given** the merchant confirms spend safety
**When** they submit
**Then** the system saves:
- monthly cap amount
- paid usage consent timestamp (audit trail)
**And** the shop becomes eligible for paid usage once the free gift is used

**Given** the shop has **$0 free gift balance remaining** and no paid usage consent recorded
**When** a billable action is attempted (generate/regenerate/remove-bg)
**Then** the action is blocked
**And** the UI clearly explains how to enable paid usage (link to Billing/Spend Safety settings)

**Given** the shop has some free gift balance remaining but it is insufficient to cover the full cost of a billable action
**When** a billable action is attempted
**Then** the action is blocked unless paid usage consent is recorded
**And** the UI explains the free gift would be partially used and the remaining amount would be billed via Shopify

**Given** the shop is on Standard and the 7-day trial is active
**When** a billable action is attempted
**Then** the same gift/consent/cap rules apply (trial does not waive usage charges)

### Story 5.3: Monthly Cap Enforcement + Explicit Cap Increase Flow

As a merchant,
I want a monthly spending cap that hard-stops charges and requires explicit increases,
So that I stay in control of my maximum spend.

**Acceptance Criteria:**

**Given** the shop has a monthly cap configured (default **$10.00 USD**)
**When** paid usage occurs
**Then** the system tracks month-to-date spend against the cap

**Given** the shop reaches the cap
**When** the merchant attempts any further paid action
**Then** the action is blocked
**And** the UI explains the cap was reached and shows the reset date (start of next calendar month, UTC)

**Given** the cap is reached
**When** the merchant wants to continue
**Then** they must go to spend safety settings and explicitly increase the cap (with confirmation) before paid actions are allowed again

### Story 5.4: Usage Visibility + Auditable Billing Events

As a merchant,
I want to see my usage, spend, and billable events history,
So that I can audit charges and understand costs.

**Acceptance Criteria:**

**Given** the merchant opens the usage & billing screen
**When** the page loads
**Then** it shows month-to-date spend, current cap, and remaining capacity
**And** it shows a list of billable events with timestamps and USD amounts
**And** billable events include at least: event type (generation/regeneration/remove-bg/order_fee), status (succeeded/failed/waived), and an idempotency key so retries cannot double-charge
**And** `order_fee` events are clearly labeled as “$0.25 per successful personalized order line” (Standard only)

**Given** a billable action succeeds (provider cost incurred)
**When** the system records billing
**Then** exactly one billable event is created for that action
**And** billing is only finalized once the result is successfully persisted and retrievable (end-to-end success)
**And** exactly one Shopify Usage Charge is created for the billable USD amount after applying any remaining free gift balance (may be $0)

**Given** a billable action fails and no provider cost is incurred
**When** the system records the outcome
**Then** the billable event is recorded as failed/voided
**And** the merchant is not charged

**Given** a billable action fails after the provider cost was incurred but the app could not deliver/persist the result (internal failure)
**When** the system records the outcome
**Then** the billable event is recorded as failed/waived
**And** the merchant is not charged

### Story 5.5: Enforce Generation Limits (Per-Product, Per-Session, Reset Window)

As a merchant,
I want the system to enforce generation limits by product and by session with a reset window,
So that costs are controlled and abuse is prevented.

**Acceptance Criteria:**

**Given** a shop has default generation limits configured
**When** the system evaluates limits
**Then** the defaults are:
- per-product generation limit: **5**
- per-session generation limit: **15**
- reset window: **30 minutes** (rolling)

**Given** a buyer session is active
**When** a generation is requested
**Then** the system checks both per-product and per-session remaining attempts
**And** if either limit is reached, the generation is blocked
**And** the buyer receives clear messaging including tries remaining or reset timing

## Epic 6: Storefront Buyer Personalization (Single Template MVP)

Buyers can open a stepper-based personalization experience on the product page, upload a photo (and optional text), request generation, securely preview the result (including mockups), regenerate within limits, and add to cart with personalization metadata and clear messaging.

### Story 6.1: Open Storefront Personalization Stepper (Single Template MVP)

As a buyer,
I want to open the personalization stepper on the product page,
So that I can personalize the product before adding to cart.

**Acceptance Criteria:**

**Given** the app block is installed and storefront personalization is enabled for the shop
**And** personalization is enabled for the product and exactly one template is assigned (MVP)
**When** the buyer views the product page
**Then** they can open/see the personalization stepper UI

**Given** the product is not eligible (disabled or no template assigned)
**When** the buyer views the product page
**Then** the personalization UI is hidden or shows a non-interactive state (no broken experience)

### Story 6.2: Upload Photo + Optional Text Input (Validation)

As a buyer,
I want to upload a photo (and optionally enter text) as inputs to personalization,
So that the generated preview uses my content.

**Acceptance Criteria:**

**Given** the buyer is in the personalization stepper
**When** they reach the input step
**Then** the UI requires a photo upload to proceed

**Given** the buyer uploads an image file
**When** the file type is one of `jpeg`, `jpg`, `png`, `heic`, `avif`, `webp`
**Then** the upload is accepted and a preview of the uploaded image is shown

**Given** the template has optional text enabled
**When** the buyer views the input step
**Then** a text input field is shown and can be left empty

**Given** the uploaded file is an unsupported type or upload fails
**When** the buyer attempts to proceed
**Then** the UI blocks progression and shows a clear error message

### Story 6.3: Generate Preview + Secure Access + Performance Tracking

As a buyer,
I want to generate a preview image from my inputs,
So that I can see the personalized result before adding to cart.

**Acceptance Criteria:**

**Given** the buyer has provided required inputs (photo + optional text)
**When** they click “Generate preview”
**Then** the system generates a preview image and returns it to the buyer session
**And** the preview is accessed via a secure, time-limited URL (no public bucket access)

**Given** preview generation completes
**When** the buyer views the result
**Then** the generated image is shown as the hero preview

**Given** generation occurs
**When** the system records telemetry
**Then** it emits PostHog events for generation with timing and outcome (success/failure)
**And** the system tracks **p95 generation time < 15s** (operator-visible metric)

**Given** generation fails
**When** the buyer sees the error
**Then** the UI shows calm messaging and offers a deterministic “Try again” action

### Story 6.4: Printify Mockups via “Preview” Modal (Non-Blocking)

As a buyer,
I want to preview my generated design on product mockups in a modal,
So that I can trust what I’m buying without blocking purchase.

**Acceptance Criteria:**

**Given** a preview image was generated successfully
**When** the result step is shown
**Then** the system triggers Printify mockup generation in the background

**Given** the buyer is viewing the result step
**When** they click “Preview”
**Then** a modal opens displaying available mockups (carousel/gallery)

**Given** mockup generation is still running
**When** the buyer opens the modal
**Then** the modal shows a clear loading state and updates when mockups arrive

**Given** mockup generation fails
**When** the buyer opens the modal
**Then** the modal shows a calm error and a deterministic retry action (“Try again”)

**Given** mockups are not ready or fail
**When** the buyer is on the result step
**Then** the buyer can still proceed to **Add to cart** using the generated preview (mockups never block purchase)

### Story 6.5: Regenerate Preview Within Limits (Cost + Tries Left + Reset Timer)

As a buyer,
I want to regenerate the preview within allowed limits,
So that I can try different results before purchasing.

**Acceptance Criteria:**

**Given** the buyer is on the result step and has remaining tries
**When** they click “Try again”
**Then** the system runs another generation using the same inputs/settings
**And** it consumes the same USD billing rules as generation (+ remove background cost if enabled)

**Given** the buyer is using regeneration
**When** the UI shows the action
**Then** it displays “tries left” and the reset timer window clearly (30-minute rolling reset)

**Given** the buyer reaches a limit (per-product or per-session)
**When** they attempt to regenerate
**Then** regeneration is blocked
**And** the UI explains the limit and shows when it resets

### Story 6.6: Add to Cart with `personalization_id` Metadata

As a buyer,
I want to add the product to cart with personalization metadata,
So that my customization is preserved through checkout.

**Acceptance Criteria:**

**Given** the buyer has a successful generated preview for the product
**When** they click “Add to cart”
**Then** the product is added to cart
**And** the line item includes a `personalization_id` reference that links to the buyer’s generated preview/session record

**Given** the buyer returns to the cart
**When** the cart line item is displayed
**Then** the personalization is still associated via `personalization_id`

**Given** adding to cart fails
**When** the buyer clicks “Add to cart”
**Then** the UI shows a calm error and a deterministic retry action

## Epic 7: Post‑Purchase Fulfillment + Reliability, Recovery, and Ops

The system detects paid orders that include personalization metadata, generates final print-ready assets per order line, submits and tracks Printify fulfillment, handles retries/idempotency safely, and provides operator visibility, diagnostics, and reprocessing.

### Story 7.1: Detect Paid Orders with `personalization_id` (Webhook + Idempotent Intake)

As an operator,
I want the system to detect paid orders that include personalized line items,
So that fulfillment can start automatically and safely.

**Acceptance Criteria:**

**Given** Shopify sends an order “paid” webhook
**When** the system receives it
**Then** it verifies the webhook HMAC before processing
**And** it identifies order lines that include `personalization_id`

**Given** an eligible order line is found
**When** the system starts processing
**Then** it creates an idempotent processing record keyed by (`shop_id`, `order_line_id`)
**And** it triggers async workflow processing (Inngest) for that order line

**Given** the same webhook is delivered multiple times
**When** it is processed again
**Then** the system does not create duplicate fulfillment runs or duplicate billable events

**Given** the shop is on the **Standard** plan
**And** an eligible order line is found (has `personalization_id`)
**When** an order “paid” webhook is processed
**Then** the system records a per-order fee billable event (`order_fee`) for that order line (**$0.25**) with an idempotency key
**And** it creates the corresponding Shopify Usage Charge at that time

**Given** the shop is on **Early Access**
**When** an order “paid” webhook is processed for an eligible order line
**Then** the per-order fee is waived (no charge is created)

### Story 7.2: Final Print-Ready Asset = Generated Preview (Persist + Retrieve)

As an operator,
I want the system to treat the buyer’s generated image as the final print-ready asset and persist it per order line,
So that fulfillment can run without re-generating.

**Acceptance Criteria:**

**Given** an order line has `personalization_id`
**When** fulfillment processing starts
**Then** the system resolves `personalization_id` to the stored generated image
**And** it persists/associates that image as the final print-ready asset for the order line (secure storage + stable reference)

**Given** the final asset is associated to the order line
**When** the operator or merchant needs to retrieve it
**Then** the system provides secure access to the print-ready asset (time-limited URL) without exposing public buckets

**Given** the referenced generated image is missing or inaccessible
**When** fulfillment processing runs
**Then** the order line is marked as failed with a clear reason and recovery guidance

### Story 7.3: Submit to Printify + Track Status + Visibility

As a merchant or operator,
I want to track fulfillment status for each personalized order line,
So that I can see what’s pending, what succeeded, and what needs attention.

**Acceptance Criteria:**

**Given** an order line has a resolved final print-ready asset
**When** fulfillment processing runs
**Then** the system submits the fulfillment request to Printify for that order line
**And** it records a fulfillment job with status `pending`

**Given** Printify accepts the request
**When** the system receives the response
**Then** the job is updated to `succeeded`
**And** Printify reference IDs are stored for diagnostics

**Given** Printify rejects the request or a non-retryable error occurs
**When** the system receives the failure
**Then** the job is updated to `failed` with a clear reason

**Given** the merchant or operator views an order/fulfillment screen
**When** personalized orders exist
**Then** they can see each order line’s fulfillment job status (`pending/succeeded/failed`)
**And** failed items show the failure reason and next-step guidance

### Story 7.4: Operator Reprocess Failed Order Line + Diagnostics

As an operator,
I want to reprocess a failed generation/mockup/fulfillment job for an order line and view diagnostics,
So that I can recover without duplicating charges or fulfillment.

**Acceptance Criteria:**

**Given** an order line is in a failed state
**When** the operator views the order line details in an operator/admin screen
**Then** they can see diagnostics sufficient to troubleshoot (timestamps, status history, error reason, relevant reference IDs)

**Given** the order line is failed
**When** the operator clicks “Reprocess” and confirms
**Then** the system triggers reprocessing for that order line via async workflow
**And** it reuses the same idempotency keys so it does not duplicate Printify submissions or billable events

**Given** the reprocess succeeds
**When** the workflow completes
**Then** the order line status updates accordingly and becomes visible in the tracking screen

## Epic 8: Compliance Baselines

Merchants accept baseline policies (acceptable use and copyright responsibilities) with minimal friction, and the system supports reporting/flagging potential violations for follow-up.

### Story 8.1: Policy Acceptance Inline (Minimal Friction)

As a merchant,
I want to accept baseline policies with minimal friction,
So that I can start using the app quickly while remaining compliant.

**Acceptance Criteria:**

**Given** the merchant is on the final onboarding confirmation screen
**When** they review the final checklist before continuing
**Then** the UI shows a single required checkbox: “I agree to the Acceptable Use & Copyright policies”
**And** the policy text is accessible via links (opens modal/drawer or new tab)

**Given** the merchant does not check the box
**When** they click “Finish onboarding”
**Then** the action is blocked with a clear message and the checkbox is highlighted

**Given** the merchant checks the box and finishes onboarding
**When** the system records acceptance
**Then** it stores policy acceptance with timestamp + policy version (audit trail)
