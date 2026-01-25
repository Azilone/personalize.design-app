---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-03-success
  - step-04-journeys
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-complete
inputDocuments:
  - _bmad-output/planning-artifacts/product-brief-personalize-design-app-2026-01-10.md
  - _bmad-output/analysis/brainstorming-session-2026-01-10T10-40-38+0100.md
documentCounts:
  briefCount: 1
  researchCount: 0
  brainstormingCount: 1
  projectDocsCount: 0
workflowType: "prd"
lastStep: 10
project_name: personalize-design-app
author: Kevin
date: 2026-01-10T12:15:21Z
---

# Product Requirements Document - personalize-design-app

**Author:** Kevin
**Date:** 2026-01-10T12:15:21Z

## Executive Summary

Personalize Design is a multi-tenant Shopify app for Print-on-Demand merchants that increases AOV and conversion by enabling simple, premium personalization that’s fast to set up and delivers results quickly. Merchants create reusable **design templates** and assign them to products; buyers personalize directly on the product page by uploading one photo (and optional text), generate a premium-looking design, preview it on-product via mockups, and purchase. After purchase, the app produces a print-ready PNG per order line for fulfillment.

It solves a common POD pain: incumbent personalizers are often complex to configure and still produce generic-looking results, so merchants either avoid personalization or fall back to manual/artist workflows that slow iteration and trend testing. The product’s success bar is not only “it works”, but that the generated designs consistently feel good enough to sell, and the system remains reliable and economically viable for merchants’ businesses—so they can differentiate, increase pricing power, and iterate quickly to find product-market fit.

Printify is the initial supplier integration for the MVP; the longer-term vision expands to additional POD suppliers and additional sales platforms (e.g., Etsy).

### What Makes This Special

- **Simplicity:** minimal setup friction for merchants via reusable design templates and opinionated defaults
- **Speed to value:** fast time-to-first-result for both merchant testing and buyer personalization
- **Design quality that sells:** outputs that people genuinely like (not generic/clipart-like), with a clear “good enough to sell” bar
- **Business viability + stability:** reliable end-to-end flow and controls that keep the product sustainable for merchants
- **Iteration leverage:** rapid design iteration to test niches/trends and reach product-market fit faster

## Project Classification

**Technical Type:** saas_b2b  
**Domain:** ecommerce (print-on-demand)  
**Complexity:** medium  
**Project Context:** Greenfield - new project

## Success Criteria

### User Success

**Merchant (POD seller)**

- **Time-to-first-value:** A merchant can install, set up, and validate a first _sellable_ design template in **≤ 30 minutes**.
- **Design quality (merchant signal):** Track **thumbs up/down** on generated outputs.
  - Target: **TBD** thumbs-up rate (start with baseline; iterate).
- **Iteration efficiency:** Median **≤ 5 generations** before a merchant validates a final design template (hypothesis to validate).

**Buyer (storefront)**

- **Generation success:** At least **90%** of buyer generation attempts complete successfully (no errors/timeouts) (MVP target; increase post-MVP).
- **Regeneration UX + guardrails (defaults):**
  - **5 generations per product**
  - **15 generations per buyer session**
  - Reset window: **~30 minutes** (configurable by merchant).

### Business Success

**3-month targets**

- **App profit:** **$1,000/month**
- **Volume adoption:** at least one (or a small set of) merchants doing **500+ orders/month**, and broad distribution across the Shopify POD market.
- **Product maturity:** move beyond MVP into a “real product” with expanded features, higher reliability, and stronger output quality.

**12-month targets**

- **Platform expansion:** support additional POD suppliers and additional sales platforms (e.g., **Etsy** and **WooCommerce**).
- **Value expansion:** add features that help sellers achieve product-market fit faster by creating/testing unique designs quickly that buyers love.

### Technical Success

- **Automation-first fulfillment:** paid orders should be fulfilled automatically end-to-end under normal conditions.
- **Resilience to supplier/API errors:** when external APIs fail, the system must still be operationally safe:
  - retries for transient errors
  - idempotency to prevent duplicates
  - a recoverable “stuck” state with reprocessing (manual or automated)
  - clear observability (logs + alerts) so issues don’t silently break fulfillment

### Measurable Outcomes

- **North Star:** % of installed stores with ≥ 1 personalized sale
- **Activation (24h):** merchant has **multiple products** with **multiple design templates** live on storefront
  - Target: **10% of installs** activated within 24 hours (initial hypothesis)
- **Performance:** **p95 generation time < 15s**
- **Reliability:** maximize % orders automatically fulfilled and minimize manual intervention rate (targets TBD)
- **Economics (key ratio):** track generation-to-order ratio (including non-buyers)
  - Initial target: **≤ 25 generated images per 1 order** (hypothesis)
  - Instrument via PostHog; merchant-facing dashboard can be post-MVP.

## Product Scope

### MVP - Minimum Viable Product

- Shopify app with merchant admin to create/manage **design templates** and assign them to products
- Product-page app block: upload 1 photo + optional text → generate → preview → add to cart
- Print-ready PNG generated per paid order line
- Supplier integration: **Printify only** for MVP
- Cost controls + abuse prevention defaults (limits + merchant-configurable caps)
- Reliability essentials: idempotency, retries, basic observability

### Growth Features (Post-MVP)

- Improved quality controls + iteration tooling to increase “sellable” rate and reduce generations per validation
- Better analytics: per-template performance, thumbs-up rate, conversion impact, generation-to-order ratio
- Additional suppliers (beyond Printify)

### Vision (Future)

- Multi-supplier POD support + multi-platform commerce (Etsy, WooCommerce, etc.)
- Features that help sellers reach product-market fit faster through rapid creation/testing of unique designs buyers love

## User Journeys

### Journey 1 — Alex (Side-Hustle POD Merchant) launches fast and tests what sells (happy path)

**Opening Scene**

Alex runs POD as a side business and cares about making money first. He’s active on social media and wants to move fast on trends, but he doesn’t have time for complex personalization tools or support headaches.

**Rising Action**

- Alex installs the app, connects his store, and sees a clear promise: “create a sellable design template in ~30 minutes”.
- He picks/creates a **design template** for a niche (e.g., family gift mug) and runs a few test generations.
- He uses thumbs up/down to judge “sellable” quality, iterating quickly.
- He assigns the design template to a product and enables the product-page block.

**Climax**

Alex publishes and drives traffic from social posts. A buyer personalizes and purchases. Alex sees the first order flow through without manual work.

**Resolution**

Alex now has a repeatable loop: new trend → new design template → quick validation → publish → test demand.

**Where it can fail / recovery**

- Generation error/timeout: clear retry + guidance; doesn’t block publishing entirely.
- Cost surprises: hard caps + clear usage visibility so Alex doesn’t get burned.
- Mismatch between preview and output: trust breaks; Alex uninstalls.

**This journey reveals requirements for**

Onboarding, design-template creation + testing, thumbs signal capture, product assignment, storefront embedding, cost controls, reliability, preview trust.

---

### Journey 2 — Sarah (Gift Buyer) wants a distinctive product she’s proud to buy (preview trust)

**Opening Scene**

Sarah is buying a gift (or something for herself). She wants a distinctive, custom product and wants confidence it will look like what she’s paying for.

**Rising Action**

- On the product page, she clicks **"Personalize & Order"** which opens a focused **Modal** (or full-screen experience on mobile).
- She uploads her photo (+ optional text) and clicks "Generate".
- While she waits (~10-15s), the interface keeps her engaged.
- She sees the **Raw Generated Design** first. It looks cool.
- She clicks "Preview on Product" (or the system auto-triggers it). The system generates real mockups in the background.
- She views the **Real Product Mockups** (generated asynchronously) to confirm it looks great on the actual item.

**Climax**

She reaches a moment of pride/confidence: "Yes — this looks premium and true to what I want."

**Resolution**

She clicks **"Add to Cart"** _inside the modal_, which adds the specific variation to her cart and closes the experience.

**Where it can fail / recovery**

- Slow generation: impatience → drop-off.
- Mockup generation delay: user might drop off if waiting too long for the "on-product" view.
- Preview mismatch: complaint/refund risk.
- Confusing limits: frustration; needs clear “you have X tries” messaging.

**This journey reveals requirements for**

Fast UX (Modal/Portal), clear states (Input -> Generating -> Result -> Mockup), regeneration limits + messaging, cart metadata, post-purchase traceability.

---

### Journey 3 — Enterprise POD Owner scales output and PMF testing (but ops realities bite)

**Opening Scene**

A high-volume POD owner (millions/year) wants to scale creation, raise AOV, and find PMF faster by producing more premium personalized designs with less time-to-good-design.

**Rising Action**

- They evaluate the app not just for “first output”, but for: cost predictability, uptime/reliability, support volume, brand consistency, and copyright/compliance risk.
- They roll out a small set of design templates across several products and monitor performance.

**Climax (real-world friction)**

As Giosuè points out: 50–60% of customers ask for changes—often very specific or even “absurd” details—regardless of initial quality. That creates a revision workflow that can’t be ignored. The enterprise team needs a way to handle revision requests without chaos, duplicate work, or brand damage.

**Resolution**

The enterprise flow becomes: generate → sell → revisions pipeline → fulfill with confidence, while controlling costs and avoiding policy/legal issues.

**Where it can fail / recovery**

- Revisions explode support costs: the app must not pretend this doesn’t exist.
- External API/supplier failures: must not cause missed SLAs.
- Copyright/compliance: takedowns/chargebacks/reputation risk.

**This journey reveals requirements for**

Team workflows, permissions, monitoring, cost governance, compliance controls, and a defined revision-request pipeline (even if some parts are post-MVP).

---

### Journey 4 — Support/Ops handles failures, revisions, and compliance (merchant-side or internal)

**Opening Scene**

A support/ops person (either the merchant’s team or your internal ops for early access) deals with: failed generations, preview complaints, revision requests, fulfillment errors, and abuse/cost incidents.

**Rising Action**

- They receive a “customer wants changes” message tied to an order line.
- They need the full context: original inputs, generation history, selected output, what the buyer is requesting, and what has already been tried.

**Climax**

They must resolve the case with minimal back-and-forth:

- either trigger a re-generation within policy
- or route to a manual designer workflow
- or issue a refund/partial refund
- or reprocess a failed fulfillment step safely (idempotent)

**Resolution**

Issue resolved; customer satisfied; merchant protected from runaway costs; no duplicate orders/files.

**This journey reveals requirements for**

Case/ticket primitives, audit trail, safe retries, manual override hooks, observability, abuse protection, and clear policies.

### Journey Requirements Summary

Across these journeys, the system needs capabilities in:

- **Design templates:** create/test/validate, assign to products, manage versions
- **Storefront UX:** upload, generate, preview trust, regeneration limits + messaging, add-to-cart metadata
- **Quality signals:** thumbs up/down + “validated template” tracking
- **Reliability:** retries, idempotency, recoverable states, operational visibility
- **Economics:** spend caps, usage visibility, generation-to-order ratio instrumentation (PostHog)
- **Enterprise readiness (now or post-MVP):** roles/permissions, monitoring, compliance guardrails
- **Revision reality:** define how “customer requests changes” is handled (regen vs manual designer pipeline), even if the full ticketing system is post-MVP

## Innovation & Novel Patterns

### Detected Innovation Areas

1. **Lightweight creation vs heavy editors (MVP)**
   Instead of a complex layer-based editor/personalization engine, the product aims to let merchants produce a premium, sellable design for any POD product quickly using guided, opinionated **design templates** and fast iteration.

2. **Workflow automation for merchant viability**
   The innovation is not only generation, but making the end-to-end workflow viable for merchants: fast time-to-value, predictable cost, reliable fulfillment automation, and clear quality signals.

3. **AI agents + assisted commerce workflows (Future)**
   Future opportunity includes AI agents that assist sellers (automation of repetitive setup/ops), plus features like “style from inspiration”, multi-platform personalization (e.g., Etsy), and automated copyright checks.

### Market Context & Competitive Landscape

Incumbent approaches often rely on heavy personalization engines and complex configuration. The innovation is to trade editor complexity for faster setup, faster iteration, and a clearer “sellable result” loop.

### Validation Approach

- **Compare vs incumbent baseline:** measure time-to-first-sellable design template and time-to-publish product personalization.
- **Quality validation:** thumbs up/down + “sellable” confirmation; track median generations needed to validate a design template.
- **Economic validation:** measure generation-to-order ratio and cost per order outcome (instrumentation-first; merchant dashboard can be post-MVP).
- **Reliability validation:** track generation success rate, fulfillment success rate, and recovery time from external API failures.

### Risk Mitigation

- **Quality risk:** if outputs are not consistently sellable, merchants churn → mitigate with strong defaults, template curation, and rapid iteration loops.
- **Cost risk:** mitigate with caps/limits, monitoring, and abuse prevention.
- **Copyright risk:** mitigate with policy + detection/flagging workflow and audit trail (phased rollout).
- **Fulfillment risk:** mitigate with idempotency, retries, recoverable states, and clear observability.
- **Speed risk (time-to-generate):** mitigate with performance budgets (e.g., p95), model/provider tuning, and clear UX fallbacks.
- **Buyer change-request risk (editing/out-of-scope):** buyers may not be 100% satisfied and request changes; image editing/inpainting is out of MVP scope → mitigate with clear expectation-setting, limited regeneration loops, and a defined escalation path (manual or post-MVP features).

## saas_b2b Specific Requirements

### Project-Type Overview

personalize-design-app is a B2B SaaS-style Shopify app (multi-tenant) with:

- a merchant admin to configure design templates, products, and spend controls
- a storefront product-page app block for buyer personalization
- backend workflows for generation + fulfillment automation + billing

### Technical Architecture Considerations

- Multi-tenant by design (MVP: per-Shop tenant isolation).
- Usage-based billing and cost controls are core to product viability.
- Reliability is a primary constraint (generation + fulfillment must be recoverable).

### Tenant Model (tenant_model)

**MVP tenant definition:** Shop = tenant

- Each Shopify shop is its own tenant for data isolation, billing, and configuration.
- Long-term direction: a single business owner may manage multiple shops across platforms/suppliers (future capability), but MVP optimizes for Shopify’s tenant/billing model.

### Permissions / RBAC (rbac_matrix)

**MVP:** No RBAC.

- Single “owner” context per shop is sufficient for early access.
- (Future) Add roles for enterprise workflows (designer/support/analyst) if needed.

### Subscription Tiers & Billing (subscription_tiers)

**Plans**

**Plan: Early Access (invite-only)**

- **Access price:** $0/month (requires code `EARLYACCESS`)
- **Billing primitive:** a $0/month Shopify app subscription so Shopify Usage Charges can be used for usage billing.
- **Welcome gift:** first **$1.00 USD** of AI usage is free (one-time gift on Early Access activation).
- **Usage pricing (examples):**
  - Image generation (current primary model): **$0.05** per generated image
  - Remove background tool: **$0.025** per operation
- **Margin rule:** usage pricing must stay above provider cost (fal.ai) to preserve margin.
- **Per-order fee:** waived during Early Access.

**Plan: Standard**

- **Access price:** **$19/month**
- **Free trial:** **7 days** for the $19/month access fee (trial does not waive usage fees).
- **Per-order fee:** **$0.25** per successful personalized order line (billed via Shopify Usage Charges).
- **Per-order fee trigger:** charged when the order reaches **paid** status (Shopify paid webhook).
- **Usage pricing:** same per-action USD pricing as above (billed via Shopify Usage Charges).
- **Welcome gift:** first **$1.00 USD** of AI usage is free (one-time gift on Standard activation).

**Spend Safety / Consent**

- **Default capped amount:** $10.00 USD requested at installation.
- Add an explicit consent step before any paid usage can occur (charges start only after the $1 gift is used):
  - Clear UI messaging: “After the free $1 gift, usage is billed via Shopify.”
  - Merchant must actively confirm (e.g., checkbox + confirm button).
  - If not confirmed, block paid generations/tools and show a clear explanation + a path to enable paid usage.
- The free usage gift is applied first before any paid charge (partial coverage is allowed; only the remainder is billed).
- Billing is per successful billable operation (generation/regeneration/remove-bg). If the provider call fails and no provider cost is incurred, the merchant is not billed.
- Printify mockup generation does not consume billable AI usage (it is handled by Printify).

### Integrations (integration_list)

**MVP required integrations**

- Shopify (auth, products, cart/checkout metadata, webhooks, billing/usage)
- Printify (supplier fulfillment for MVP)
- fal.ai (image generation + tools)
- Object storage (for uploads, generated assets, print-ready outputs)
- Analytics (e.g., PostHog) for funnel + cost metrics
- Inngest for workflow orchestration (generation, mockups, fulfillment, retries)

### Compliance Requirements (compliance_reqs)

**MVP approach:** ship fast with baseline safeguards

- Clear merchant-facing billing transparency + consent (to reduce charge disputes).
- Audit logging for billable actions (generations, fulfillment triggers).
- Copyright handling as a phased capability:
  - initial policy + basic reporting/flagging hooks
  - evolve toward automated checks and stronger workflows post-MVP.

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Problem-Solving MVP  
**Primary Pain Solved:** POD sellers struggle to differentiate and iterate quickly because incumbent personalization tools are too complex/heavy; this blocks fast PMF discovery and limits pricing power and conversion.  
**MVP Timeline Target:** 2 weeks (ship fast to get feedback)  
**MVP Team Size:** Solo founder (Kevin)

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**

- Merchant (Alex / early adopters) creates and validates a sellable design template quickly, assigns it to a product, and goes live
- Buyer (Sarah) personalizes on product page, previews confidently, and buys
- Automated fulfillment pipeline runs reliably for paid orders (MVP supplier: Printify)
- Merchant can control spend and avoids surprise charges (consent + caps + limits)

**Must-Have Capabilities:**

Merchant admin

- Create/manage **design templates** (inputs: 1 photo + optional text; model selection; cost visibility)
- Test generation flow + thumbs up/down
- Assign design template to Shopify products
- Configure storefront limits (regen/session) + spend caps
- Explicit “paid usage consent” before charging beyond the free usage gift

Storefront

- Product-page app block: upload → generate → preview on mockup → add to cart
- Regeneration limits + clear messaging (“tries left”, “this will be billed”)

Backend workflows (Inngest)

- Upload handling + secure asset storage
- Generation orchestration (job status, retries, timeouts, idempotency)
- Paid order handling: generate final print-ready PNG per order line
- Fulfillment automation to Printify (MVP)
- Observability: logs + basic dashboards/alerts for failures

Billing & safety

- Early Access: $0/month access with `EARLYACCESS` + $1.00 free AI usage gift
- Standard: $19/month access (7-day free trial) + $0.25/order line + $1.00 free AI usage gift
- Usage billing via Shopify Usage Charges (USD amounts priced above provider cost)
- Default capped amount: $10.00
- Guardrails: per-product and per-session generation limits; abuse protection baseline

**Manual ops acceptable during early access (to stay lean):**

- Support tickets and handling exceptional cases
- Revision/change requests (even if expected to be rare, treat as an explicit “reality check” risk for scale)

**Explicitly Out of Scope for MVP (to stay lean):**

- Inpainting / image editing to satisfy “change requests” (acknowledged risk)
- Full revision-request ticketing system (manual process acceptable for early access)
- Multi-supplier support beyond Printify
- Etsy / WooCommerce integrations
- RBAC / team roles
- Automated copyright detection (policy + hooks only)

**UI expectation for post-MVP items:** When a post-MVP capability is referenced in the admin UI, it should be shown as a disabled control labeled **“Coming soon”** (static only; no functional behavior in MVP).

### Post-MVP Features

**Phase 2 (Post-MVP):**

- Improve generation success rate and latency; raise reliability targets
- Better analytics (generation-to-order ratio, template performance, merchant dashboards)
- Stronger support tooling (case/audit trail) + partial automation for common issues
- Expand template library + guided onboarding for faster sellable outcomes

**Phase 3 (Expansion):**

- Multi-supplier POD support
- Multi-platform commerce (Etsy, WooCommerce, etc.)
- AI features: style from inspiration, seller-assist agent workflows
- Stronger copyright/compliance workflows and automation

### Risk Mitigation Strategy

**Technical Risks:** generation latency/timeouts, external API failures, fulfillment reliability → mitigate with retries, idempotency, recoverable states, and monitoring.  
**Market Risks:** outputs not “sellable” → mitigate with strong defaults, template curation, fast iteration loop, and quality measurement (thumbs + generations-to-validate).  
**Resource Risks:** too much scope for a 2-week solo MVP → mitigate by keeping editing/inpainting and enterprise workflows out of MVP, using manual ops where acceptable in early access.

## Functional Requirements

### Merchant Setup & Onboarding

- FR1: Merchant can install the app and complete onboarding for their shop.
- FR2: Merchant can activate Early Access using an invite code.
- FR3: Merchant can view required prerequisites and setup status (e.g., supplier connection, storefront block enabled).
- FR4: Merchant can configure default spend controls for their shop (caps/limits).

### Design Templates (Merchant)

- FR5: Merchant can create a design template with defined buyer inputs (photo required; optional text).
- FR6: Merchant can configure a design template’s generation configuration (e.g., model choice and cost visibility).
- FR7: Merchant can test-generate outputs for a design template before publishing/using it.
- FR8: Merchant can capture quality feedback on test outputs (e.g., thumbs up/down).
- FR9: Merchant can manage (list/view/update/disable) design templates.
- FR10: Merchant can keep a design template in a non-live state (draft/test-only) and then publish/unpublish it for storefront use.
- FR11: Merchant can assign one or more design templates to a Shopify product.
- FR12: Merchant can unassign design templates from a product.
- FR13: Merchant can define which design templates are available to buyers for a product (e.g., enabled/disabled list).

### Storefront Personalization (Buyer)

- FR14: Buyer can open the personalization experience via a **"Personalize & Order"** trigger (Modal on Desktop; Full-screen on Mobile).
- FR15: Buyer can upload a photo as part of personalization.
- FR16: Buyer can optionally provide text input when enabled by the selected design template.
- FR17: Buyer can select a design template when multiple are available for the product.
- FR18: Buyer can request generation and receive a generated design image (Raw Design).
- FR19: System can generate and provide secure access to generated images for buyer preview during the session.
- FR20: Buyer can preview the generated design on **Real Product Mockups** (generated asynchronously via backend service/Printify).
- FR21: Buyer can regenerate a design within merchant-configured limits.
- FR22: Buyer can add the product to cart **directly from the modal** with personalization metadata attached to the line item.
- FR23: Buyer can see clear messaging when they reach limits or when billing/spend policies affect further generations.

### Storefront Enablement & Controls

- FR24: Merchant can enable/disable the storefront personalization experience for their shop.
- FR25: Merchant can enable/disable personalization per product (or per assigned design template) without uninstalling the app.

### Limits, Spend Safety, and Billing Consent

- FR26: System can grant an initial free AI usage gift on plan activation (one-time, USD-denominated).
- FR27: System can track AI usage per shop and per buyer session.
- FR28: System can enforce a per-product generation limit.
- FR29: System can enforce a per-session generation limit.
- FR30: System can prevent paid AI usage until the merchant has explicitly consented to paid usage beyond the free usage gift.
- FR31: Merchant can explicitly configure and confirm spend settings required for billing safety (capped amount + paid-usage consent status).
- FR32: Merchant can review current usage and estimated charges (at least at a basic level) for their shop.
- FR33: System can record an auditable history of billable events (generations and successful fulfilled orders).

### Integrations: Supplier Fulfillment (MVP: Printify)

- FR34: Merchant can connect, verify, and manage the supplier account integration used for fulfillment (MVP: Printify).
- FR35: Merchant can map/configure which supplier shop/account is used for fulfillment for their Shopify shop (MVP: Printify).

### Fulfillment & Order Processing (MVP Supplier: Printify)

- FR36: System can detect paid orders that include personalization metadata.
- FR37: System can produce a final print-ready image asset per personalized order line.
- FR38: System can submit fulfillment requests to the configured supplier for eligible paid orders (MVP: Printify).
- FR39: System can track fulfillment job status per order line (pending/succeeded/failed).
- FR40: Merchant (or operator) can see when an order cannot be fulfilled automatically and why.
- FR41: System can provide a secure way to access final print-ready assets for an order line (at least for operator/merchant retrieval in MVP).

### Reliability, Recovery, and Support/Ops (Solo Founder Reality)

- FR42: System can retry failed asynchronous operations safely without duplicating outcomes.
- FR43: System can ensure idempotent handling of “paid order” processing so the same order line is not processed twice.
- FR44: Operator (you) can reprocess a failed job (generation/mockup/fulfillment) for a given order line.
- FR45: Operator (you) can inspect logs/diagnostics for a generation or fulfillment attempt sufficient to troubleshoot.
- FR46: System can surface a clear failure state and recovery guidance when generation or fulfillment fails.

### Compliance Baselines (MVP)

- FR47: Merchant can view and accept baseline policies related to acceptable use and copyright responsibilities.
- FR48: System can support reporting/flagging of potential policy violations for follow-up (manual process acceptable in MVP).

## Non-Functional Requirements

### Performance

- NFR1: The storefront experience supports a p95 “time-to-first-preview-image” of **≤ 20 seconds** (model-dependent budget; measured continuously).
- NFR2: The system measures generation latency and errors and can surface basic performance indicators for troubleshooting (operator-level visibility is sufficient for MVP).

### Reliability

- NFR3: The system uses safe retry and idempotency patterns for asynchronous workflows so that transient failures do not create duplicated orders or duplicated billable events.
- NFR4: When a generation, mockup, or fulfillment step fails, the system leaves the order line in a clear recoverable state with sufficient diagnostics to support manual intervention (solo-operator friendly).

### Security

- NFR5: All network communication uses TLS (in transit encryption).
- NFR6: Sensitive data is protected at rest (credentials/secrets not stored in plaintext).
- NFR7: Webhooks from external platforms are verified before processing.
- NFR8: Customer-uploaded and generated assets are accessed via time-limited, scoped URLs (no public buckets).
- NFR9: The system enforces basic abuse controls on public endpoints (rate limiting / throttling) to reduce cost and denial-of-service risk.
- NFR10: The system produces security-relevant audit logs for billable actions (generation and fulfillment triggers) sufficient to investigate disputes.

### Integration

- NFR11: External dependency failures (Shopify, Printify, fal.ai, storage) are handled gracefully with retries where safe and clear error surfacing where not.
- NFR12: The integration layer is designed to allow swapping/adding suppliers and sales platforms post-MVP without rewriting the core product workflows (provider-agnostic direction).
