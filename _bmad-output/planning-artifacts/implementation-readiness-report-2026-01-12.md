---
workflow: check-implementation-readiness
date: 2026-01-12
project: personalize-design-app
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
includedDocuments:
  prd: "{project-root}/_bmad-output/planning-artifacts/prd.md"
  architecture: "{project-root}/_bmad-output/planning-artifacts/architecture.md"
  epics: "{project-root}/_bmad-output/planning-artifacts/epics.md"
  ux: "{project-root}/_bmad-output/planning-artifacts/ux-design-specification.md"
---

# Implementation Readiness Assessment Report

**Date:** 2026-01-12
**Project:** personalize-design-app

## Document Discovery Inventory

## PRD Files Found

**Whole Documents:**
- `prd.md` (29046 bytes, modified 2026-01-10 15:29:14)

**Sharded Documents:**
- None found

## PRD Analysis

### Functional Requirements

## Functional Requirements Extracted

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

Total FRs: 48

### Non-Functional Requirements

## Non-Functional Requirements Extracted

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

Total NFRs: 12

### Additional Requirements

- Buyer generation limits default to **5 generations per product**, **15 generations per buyer session**, reset window **~30 minutes** (configurable by merchant).
- Performance target in Success Criteria includes **p95 generation time < 15s** (distinct from NFR1’s ≤ 20s “time-to-first-preview-image”).
- Economics target includes **≤ 25 generated images per 1 order** (instrumented via analytics; merchant-facing dashboard post-MVP).
- Plan details: Early Access is invite-only (`EARLYACCESS`) with $0/month access; Standard is subscribable at **$19/month** (7-day free trial). Both plans include a one-time **$1.00** free AI usage gift; Standard also includes **$0.25/order line** (charged at order paid) + per-action USD usage billing (examples specified).
- Spend safety defaults include **$10.00** capped amount requested at installation and an explicit paid-usage consent step before charging beyond the free usage gift.
- MVP constraints: solo-founder operability; manual ops acceptable for support/exception handling; explicit out-of-scope list (e.g., inpainting, multi-supplier beyond Printify, automated copyright detection).

### PRD Completeness Assessment

- Strong: Clear product vision, explicit FR/NFR lists, and concrete success metrics/guardrails.
- Gaps/ambiguities to resolve before implementation: several metrics/thresholds are TBD (e.g., thumbs-up target); and “secure access” requirements do not yet specify storage provider, retention, or exact access scoping model.

## Epic Coverage Validation

### Epic FR Coverage Extracted

FR1: Covered in Epic 1 - Install + onboarding
FR2: Covered in Epic 1 - Early Access invite code
FR3: Covered in Epic 1 - Prerequisites/setup readiness (incl. storefront block/app embed)
FR4: Covered in Epic 1 - Default spend controls + capped amount requested at install
FR5: Covered in Epic 3 - Create template + buyer inputs
FR6: Covered in Epic 3 - Generation configuration (model/cost visibility)
FR7: Covered in Epic 3 - Test-generate outputs
FR8: Covered in Epic 3 - Quality feedback on outputs (thumbs up/down)
FR9: Covered in Epic 3 - Manage templates (list/view/update/disable)
FR10: Covered in Epic 3 - Draft/test-only + publish/unpublish
FR11: Covered in Epic 4 - Assign template(s) to product (MVP uses single assigned template per product)
FR12: Covered in Epic 4 - Unassign templates from product
FR13: Covered in Epic 9 (Post-MVP) - Control which templates are available to buyers per product
FR14: Covered in Epic 6 - Open storefront personalization experience
FR15: Covered in Epic 6 - Upload photo
FR16: Covered in Epic 6 - Optional text input (when enabled by template)
FR17: Covered in Epic 9 (Post-MVP) - Buyer selects template when multiple available
FR18: Covered in Epic 6 - Request generation and receive generated design image
FR19: Covered in Epic 6 - Secure access to generated images for preview
FR20: Covered in Epic 6 - Preview on product mockups
FR21: Covered in Epic 6 - Regenerate within limits
FR22: Covered in Epic 6 - Add to cart with personalization metadata attached
FR23: Covered in Epic 6 - Clear messaging for limits/spend/billing impacts
FR24: Covered in Epic 1 - Shop-level enable/disable storefront personalization
FR25: Covered in Epic 4 - Enable/disable personalization per product (or assignment)
FR26: Covered in Epic 5 - Initial free AI usage gift granted on plan activation
FR27: Covered in Epic 5 - Track AI usage per shop and per buyer session
FR28: Covered in Epic 5 - Enforce per-product generation limit
FR29: Covered in Epic 5 - Enforce per-session generation limit
FR30: Covered in Epic 5 - Prevent paid AI usage until merchant consents beyond free usage gift
FR31: Covered in Epic 5 - Configure/confirm spend settings (capped amount + consent)
FR32: Covered in Epic 5 - Review current usage and estimated charges
FR33: Covered in Epic 5 - Auditable billable events history
FR34: Covered in Epic 2 - Connect/manage Printify integration
FR35: Covered in Epic 2 - Map supplier shop/account used for fulfillment
FR36: Covered in Epic 7 - Detect paid orders with personalization metadata
FR37: Covered in Epic 7 - Produce final print-ready asset per order line
FR38: Covered in Epic 7 - Submit fulfillment requests to supplier (Printify)
FR39: Covered in Epic 7 - Track fulfillment job status per order line
FR40: Covered in Epic 7 - Show when order can't be fulfilled automatically + why
FR41: Covered in Epic 7 - Secure access to final print-ready assets
FR42: Covered in Epic 7 - Safe retries for async operations without duplicates
FR43: Covered in Epic 7 - Idempotent paid-order processing per order line
FR44: Covered in Epic 7 - Operator reprocess failed jobs
FR45: Covered in Epic 7 - Operator diagnostics/log access
FR46: Covered in Epic 7 - Clear failure state + recovery guidance
FR47: Covered in Epic 8 - Policy acceptance
FR48: Covered in Epic 8 - Reporting/flagging for follow-up

Total FRs in epics: 48

### Coverage Matrix

| FR Number | PRD Requirement | Epic Coverage | Status |
| --------- | --------------- | ------------- | ------ |
| FR1 | Merchant can install the app and complete onboarding for their shop. | Epic 1 - Install + onboarding | ✓ Covered |
| FR2 | Merchant can activate Early Access using an invite code. | Epic 1 - Early Access invite code | ✓ Covered |
| FR3 | Merchant can view required prerequisites and setup status (e.g., supplier connection, storefront block enabled). | Epic 1 - Prerequisites/setup readiness (incl. storefront block/app embed) | ✓ Covered |
| FR4 | Merchant can configure default spend controls for their shop (caps/limits). | Epic 1 - Default spend controls + capped amount requested at install | ✓ Covered |
| FR5 | Merchant can create a design template with defined buyer inputs (photo required; optional text). | Epic 3 - Create template + buyer inputs | ✓ Covered |
| FR6 | Merchant can configure a design template’s generation configuration (e.g., model choice and cost visibility). | Epic 3 - Generation configuration (model/cost visibility) | ✓ Covered |
| FR7 | Merchant can test-generate outputs for a design template before publishing/using it. | Epic 3 - Test-generate outputs | ✓ Covered |
| FR8 | Merchant can capture quality feedback on test outputs (e.g., thumbs up/down). | Epic 3 - Quality feedback on outputs (thumbs up/down) | ✓ Covered |
| FR9 | Merchant can manage (list/view/update/disable) design templates. | Epic 3 - Manage templates (list/view/update/disable) | ✓ Covered |
| FR10 | Merchant can keep a design template in a non-live state (draft/test-only) and then publish/unpublish it for storefront use. | Epic 3 - Draft/test-only + publish/unpublish | ✓ Covered |
| FR11 | Merchant can assign one or more design templates to a Shopify product. | Epic 4 - Assign template(s) to product (MVP uses single assigned template per product) | ✓ Covered |
| FR12 | Merchant can unassign design templates from a product. | Epic 4 - Unassign templates from product | ✓ Covered |
| FR13 | Merchant can define which design templates are available to buyers for a product (e.g., enabled/disabled list). | Epic 9 (Post-MVP) - Control which templates are available to buyers per product | ✓ Covered |
| FR14 | Buyer can open the personalization experience on a product page where the app is enabled. | Epic 6 - Open storefront personalization experience | ✓ Covered |
| FR15 | Buyer can upload a photo as part of personalization. | Epic 6 - Upload photo | ✓ Covered |
| FR16 | Buyer can optionally provide text input when enabled by the selected design template. | Epic 6 - Optional text input (when enabled by template) | ✓ Covered |
| FR17 | Buyer can select a design template when multiple are available for the product. | Epic 9 (Post-MVP) - Buyer selects template when multiple available | ✓ Covered |
| FR18 | Buyer can request generation and receive a generated design image. | Epic 6 - Request generation and receive generated design image | ✓ Covered |
| FR19 | System can generate and provide secure access to generated images for buyer preview during the session. | Epic 6 - Secure access to generated images for preview | ✓ Covered |
| FR20 | Buyer can preview the generated design on a product mockup. | Epic 6 - Preview on product mockups | ✓ Covered |
| FR21 | Buyer can regenerate a design within merchant-configured limits. | Epic 6 - Regenerate within limits | ✓ Covered |
| FR22 | Buyer can add the product to cart with personalization metadata attached to the line item. | Epic 6 - Add to cart with personalization metadata attached | ✓ Covered |
| FR23 | Buyer can see clear messaging when they reach limits or when billing/spend policies affect further generations. | Epic 6 - Clear messaging for limits/spend/billing impacts | ✓ Covered |
| FR24 | Merchant can enable/disable the storefront personalization experience for their shop. | Epic 1 - Shop-level enable/disable storefront personalization | ✓ Covered |
| FR25 | Merchant can enable/disable personalization per product (or per assigned design template) without uninstalling the app. | Epic 4 - Enable/disable personalization per product (or assignment) | ✓ Covered |
| FR26 | System can grant an initial free AI usage gift on plan activation (one-time, USD-denominated). | Epic 5 - Initial free AI usage gift granted on plan activation | ✓ Covered |
| FR27 | System can track AI usage per shop and per buyer session. | Epic 5 - Track AI usage per shop and per buyer session | ✓ Covered |
| FR28 | System can enforce a per-product generation limit. | Epic 5 - Enforce per-product generation limit | ✓ Covered |
| FR29 | System can enforce a per-session generation limit. | Epic 5 - Enforce per-session generation limit | ✓ Covered |
| FR30 | System can prevent paid AI usage until the merchant has explicitly consented to paid usage beyond the free usage gift. | Epic 5 - Prevent paid AI usage until merchant consents beyond free usage gift | ✓ Covered |
| FR31 | Merchant can explicitly configure and confirm spend settings required for billing safety (capped amount + paid-usage consent status). | Epic 5 - Configure/confirm spend settings (capped amount + consent) | ✓ Covered |
| FR32 | Merchant can review current usage and estimated charges (at least at a basic level) for their shop. | Epic 5 - Review current usage and estimated charges | ✓ Covered |
| FR33 | System can record an auditable history of billable events (generations and successful fulfilled orders). | Epic 5 - Auditable billable events history | ✓ Covered |
| FR34 | Merchant can connect, verify, and manage the supplier account integration used for fulfillment (MVP: Printify). | Epic 2 - Connect/manage Printify integration | ✓ Covered |
| FR35 | Merchant can map/configure which supplier shop/account is used for fulfillment for their Shopify shop (MVP: Printify). | Epic 2 - Map supplier shop/account used for fulfillment | ✓ Covered |
| FR36 | System can detect paid orders that include personalization metadata. | Epic 7 - Detect paid orders with personalization metadata | ✓ Covered |
| FR37 | System can produce a final print-ready image asset per personalized order line. | Epic 7 - Produce final print-ready asset per order line | ✓ Covered |
| FR38 | System can submit fulfillment requests to the configured supplier for eligible paid orders (MVP: Printify). | Epic 7 - Submit fulfillment requests to supplier (Printify) | ✓ Covered |
| FR39 | System can track fulfillment job status per order line (pending/succeeded/failed). | Epic 7 - Track fulfillment job status per order line | ✓ Covered |
| FR40 | Merchant (or operator) can see when an order cannot be fulfilled automatically and why. | Epic 7 - Show when order can't be fulfilled automatically + why | ✓ Covered |
| FR41 | System can provide a secure way to access final print-ready assets for an order line (at least for operator/merchant retrieval in MVP). | Epic 7 - Secure access to final print-ready assets | ✓ Covered |
| FR42 | System can retry failed asynchronous operations safely without duplicating outcomes. | Epic 7 - Safe retries for async operations without duplicates | ✓ Covered |
| FR43 | System can ensure idempotent handling of “paid order” processing so the same order line is not processed twice. | Epic 7 - Idempotent paid-order processing per order line | ✓ Covered |
| FR44 | Operator (you) can reprocess a failed job (generation/mockup/fulfillment) for a given order line. | Epic 7 - Operator reprocess failed jobs | ✓ Covered |
| FR45 | Operator (you) can inspect logs/diagnostics for a generation or fulfillment attempt sufficient to troubleshoot. | Epic 7 - Operator diagnostics/log access | ✓ Covered |
| FR46 | System can surface a clear failure state and recovery guidance when generation or fulfillment fails. | Epic 7 - Clear failure state + recovery guidance | ✓ Covered |
| FR47 | Merchant can view and accept baseline policies related to acceptable use and copyright responsibilities. | Epic 8 - Policy acceptance | ✓ Covered |
| FR48 | System can support reporting/flagging of potential policy violations for follow-up (manual process acceptable in MVP). | Epic 8 - Reporting/flagging for follow-up | ✓ Covered |

### Missing Requirements

- None detected: all PRD FRs (FR1–FR48) are mapped in the epics’ FR Coverage Map.
- Note: FR13 and FR17 are intentionally planned under Epic 9 (Post-MVP) rather than the MVP epics.

### Coverage Statistics

- Total PRD FRs: 48
- FRs covered in epics: 48
- Coverage percentage: 100%

## UX Alignment Assessment

### UX Document Status

Found: `{project-root}/_bmad-output/planning-artifacts/ux-design-specification.md`

### Alignment Issues

- Defaults reconciled: PRD + UX + Epics now align on **5 generations per product**, **15 per session**, reset window **~30 minutes**.
- UI system naming corrected: Admin uses **Polaris**; storefront uses **shadcn UI + Tailwind**.
- Multi-template scope clarified: multi design template selection/assignment is **post-MVP**; MVP uses a single assigned template per product, and post-MVP items should appear as static **Coming soon** where helpful.
- Mockup preview interaction clarified: storefront uses a “Preview” button that opens a modal showing all Printify-generated mockups (informational; does not block add-to-cart).

### Warnings

- If limit defaults aren’t reconciled, implementation may ship with conflicting guardrails that impact unit economics and UX messaging (“tries left” + reset window).
- If MVP vs Post-MVP multi-template scope isn’t clarified, Epic 4/Epic 9 boundaries (and storefront UI complexity) may expand unintentionally during implementation.

## Epic Quality Review

### 🔴 Critical Violations

- None remaining after clarifications: Epic 4 Story 4.3 can be implemented as an **admin preview panel** that calls the same backend generation/mockup workflow without needing the storefront stepper UI to exist.

### 🟠 Major Issues

- Epic boundary / ownership ambiguity (billing & spend safety split across epics):
  - Epic 1 references spend safety disclosure/routing.
  - Epic 5 owns spend safety + billing rules (gift, consent, cap enforcement, billing events, limit enforcement).
  - Risk: duplicated UI/logic, unclear “source of truth” for billing rules, and higher chance of inconsistent enforcement.
  - Recommendation: consolidate spend safety + billing rules into Epic 5; keep Epic 1 focused on access + onboarding shell + readiness checklist and only *display* “not configured” statuses for billing until Epic 5 is implemented.
- PRD ↔ Epics ↔ UX defaults for generation limits were reconciled (5 per product, 15 per session, ~30-minute reset window).
  - Recommendation: enforce these from a single configuration source so storefront messaging and backend checks cannot drift.

### 🟡 Minor Concerns

- Duplicated heading: “### FR Coverage Map” appears twice in `epics.md` (cosmetic, but indicates doc hygiene drift).
- Greenfield setup story is not explicit (starter template/bootstrap/CI) even though the repository already exists; confirm whether these are already complete or intentionally out of scope for the readiness review.

## Summary and Recommendations

### Overall Readiness Status

NEEDS WORK

### Critical Issues Requiring Immediate Action

- Ensure limits are implemented from a single source of truth (defaults are now aligned at **5 per product / 15 per session / ~30 minutes**).
- Ensure Epic 4 Story 4.3 stays independent by implementing it as an **admin preview panel** that calls the same backend generation/mockup workflow (not the storefront stepper UI).
- Consolidate billing/spend safety ownership (Epic 1 vs Epic 5) to avoid duplicate logic and inconsistent enforcement.

### Recommended Next Steps

1. Treat limits as configuration with a single source of truth (5/15/~30m defaults), and ensure storefront UI messaging (“tries left” + reset timer) and backend enforcement are driven by the same values.
2. Consolidate spend safety + billing rules into Epic 5 (logic + persistence + enforcement); keep Epic 1 focused on onboarding scaffolding and readiness checklist display.
3. Implement post-MVP features as static UI only (“Coming soon”) to prevent scope creep while still setting expectations (multi-template assignment/selection, etc.).

### Final Note

Assessor: Codex assistant (PM/Scrum Master)  
Date: 2026-01-12

This assessment captured issues across PRD clarity, UX alignment, epic structure, and document hygiene. Several items were clarified/updated after initial review (limits defaults, UI stack naming, post-MVP multi-template scope, and admin preview approach); re-scan the remaining “Critical Issues” before Phase 4 implementation to avoid rework and scope churn.
