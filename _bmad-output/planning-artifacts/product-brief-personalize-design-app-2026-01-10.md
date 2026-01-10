---
stepsCompleted: [1, 2, 3, 4, 5]
inputDocuments:
  - brainstorm idea of context.md
  - _bmad-output/planning-artifacts/business-plan-notes-2026-01-10.md
  - _bmad-output/planning-artifacts/business-plan-2026-01-10.md
  - _bmad-output/planning-artifacts/early-access-feedback-summary-2026-01-10.md
date: 2026-01-10
author: Kevin
---

# Product Brief: personalize-design-app

<!-- Content will be appended sequentially through collaborative workflow steps -->

## Executive Summary

Personalize Design is a Shopify app for Print-on-Demand (POD) merchants (starting with Printify-first) that increases AOV and conversion by enabling simple, premium personalization. The core promise is **better-looking, print-ready designs** (not clipart or “generic custom text”) through an experience that is **easy to set up** and delivers **quick value**. For customers, the product-page personalizer generates an “instant buy” preview (mockup) and a final print-ready PNG file. For merchants, the workflow centers around creating and assigning reusable “Blueprints” (design templates) to products so they can iterate quickly on trends/niches without the complexity of existing tools.

---

## Core Vision

### Problem Statement

Shopify POD merchants who are already selling (5–50 orders/month) struggle to differentiate and increase AOV because existing personalization tools are complex to set up and often produce generic, clipart-like results—making premium personalization feel unscalable and not worth the effort.

### Problem Impact

- Stores look less differentiated and feel less valuable, which puts pressure on conversion and pricing power.
- Merchants either avoid personalization entirely or rely on costly/manual workflows (e.g., hiring an artist), slowing down iteration and trend testing.
- When merchants do use incumbent tools, the configuration and UX friction reduces speed to value.

### Why Existing Solutions Fall Short

- Tools like teeinblue and Customily are perceived as complex and configuration-heavy (layers, UI, setup friction).
- “AI features” exist in incumbents, but the experience remains hard to use and results can still look generic (clipart/simple text treatments).
- Many merchants choose “nothing” because current options feel like overkill for mediocre outcomes.

### Proposed Solution

Build a Shopify personalizer that prioritizes **simplicity + premium outputs**:
- **Admin:** merchants create “Blueprints” (design templates) that define a high-quality style and input variables (e.g., 1 photo + text) and then assign them to products.
- **Storefront:** customers personalize on the product page via an app block, generate a premium design, preview it on the product via mockups, and add to cart; after purchase, the app produces a print-ready PNG for fulfillment.
- **Operations:** Printify-first integration; cost control and usage visibility to keep AI spend predictable and prevent abuse.

### Key Differentiators

- **Ease of setup:** faster time-to-value than incumbents; opinionated defaults aligned to POD merchant workflows.
- **Better design quality:** focus on premium-looking outputs (avoiding clipart/generic text results) with reliable previews.
- **Blueprint-first iteration:** quickly create/adjust templates and test trends/niches without deep configuration.
- **Pre-made designs that sell (directionally):** provide starting styles/templates that help merchants differentiate quickly (with room to expand later).

## Target Users

### Primary Users

#### Primary Persona: “Alex” — Solo POD Merchant (5–50 orders/month)

- **Context:** Runs a small POD shop (often side-business). Already selling and wants to grow without increasing complexity.
- **Product focus:** Custom family-gift mugs.
- **Skill level:** Canva-level (comfortable with simple design tools, not deeply technical).
- **Goals:**
  - Differentiate the store with premium-looking personalization (not clipart/generic text).
  - Launch new designs fast and test niches/trends quickly.
  - Keep the system reliable/stable so it doesn’t create support burden.
- **Current alternatives:**
  - Do nothing (skip personalization).
  - Hire a real artist (slow/expensive).
  - Use teeinblue/customily (perceived as complex; results can feel generic).
- **Success moment (“aha”):** First generated design looks premium enough to sell (and is ready to use on a real product).
- **Key needs:**
  - Easy setup (create or pick an existing Blueprint, then assign to a product).
  - Fast iteration with clear cost/limits (abuse control).
  - Print-ready output and trustworthy preview.

### Secondary Users

#### Secondary Persona: “Sarah” — Gift Buyer (End Customer)

- **Context:** Buying a gift for family/someone else (or for self).
- **Goal:** Get a beautiful, personalized mug that feels “made for them”.
- **Key needs:**
  - Simple customization (upload a photo; optional text to enhance style/prompt).
  - Fast results (target ~15s max) and a preview that matches what they’ll receive.
  - Confidence at purchase (the mockup looks real and high quality).

### User Journey

#### Merchant Journey (Alex)

1. **Discovery:** Hears about the app via POD communities / Shopify App Store.
2. **Onboarding:** Installs app, connects Printify, enables the product-page app block.
3. **Core setup:** Creates a Blueprint (or selects a provided one) focused on “family gift mug” style.
4. **Validation:** Runs a test generation to confirm output quality and speed.
5. **Activation:** Assigns the Blueprint to a mug product and goes live.
6. **Ongoing use:** Iterates on Blueprints to test new styles and trends without heavy setup.

#### Customer Journey (Sarah)

1. **Discovery:** Lands on a mug product page.
2. **Customize:** Uploads a photo (optional text).
3. **Generate & preview:** Receives a premium-looking design + mockup preview within ~15 seconds.
4. **Purchase:** Adds to cart and checks out with clear “personalized” confirmation.
5. **Fulfillment:** Order produces a print-ready PNG for Printify fulfillment.

## Success Metrics

### User Success Metrics (Merchant + Buyer)

**North Star Outcome**
- **% of installed stores with ≥1 personalized sale** (primary success signal)

**Activation / Time-to-Value (Merchant)**
- **Activation definition (24h):** merchant has **multiple products** with **multiple designs** published (Blueprint(s) assigned and live on storefront).
- **Activation target:** **10% of installs** reach Activation within 24 hours (initial target; to validate)

**Core Experience Performance (Buyer)**
- **AI generation speed:** image generation completes in **< 15 seconds** (target; define as p95)
- **Generation reliability:** track success/error/timeout rate for storefront generation

**Quality Proxies (Premium Design)**
- **Merchant feedback rating** on generated outputs (e.g., 1–5 or simple “good enough to sell”)
- **Thumbs up/down after generation** (buyer or merchant test panel)
- **Blueprint iteration count before publish:** number of generations/edits needed before the merchant “validates” a Blueprint
- **Prompt → outcome analytics:** track which Blueprint/prompt produced which design, and downstream performance

### Business Objectives

**30-day validation goals**
- **Installs:** 20 (free early access installation)
- **Monetization validation:** at least **1 merchant purchases extra credits**
- **Proof of value:** increase the **% of stores with ≥1 personalized sale** (north star)

### Key Performance Indicators

**Adoption / Activation**
- Activation rate (24h): % installs meeting the “multi-product, multi-design published” definition
- Time-to-first Blueprint created
- Time-to-first product assignment + publish

**Generation (Storefront + Merchant test)**
- p95 generation latency (target: <15s)
- Generation success rate / timeout rate / error rate
- Avg generations per Blueprint before “validated”

**Quality**
- Thumbs up rate (by Blueprint / model / prompt)
- Merchant “good enough to sell” rate (or rating average)

**Fulfillment Reliability**
- % paid orders successfully routed to Printify automatically
- Manual intervention rate (target: as close to 0 as possible)
- Mean time to recovery (MTTR) when errors occur
- Presence of a “manual recovery” path for failed orders (requirement)

**Cost Control / Abuse Prevention**
- Default monthly spend cap per merchant: **$10** (configurable by merchant)
- Track AI cost per generation, per validated Blueprint, and per personalized sale
- Session/user generation limits: **TBD** (must be configurable; define defaults)

## MVP Scope

### Core Features

**Merchant (Admin)**
- Onboarding that sets correct expectations:
  - Merchant must have products created in **Printify first** and synced to Shopify.
  - Clear early-access messaging + feedback entry points.
- **Blueprints (Design Templates)**
  - Create a Blueprint with: photo input (required), optional text input, prompt/template, model choice, and cost visibility.
  - Test panel to generate sample outputs and validate quality/speed before publishing.
  - Provide a **small starter Blueprint library** so merchants can launch quickly.
- **Product setup**
  - Select an existing Shopify product that is **Printify-synced** and assign one or more Blueprints.
  - Configure buyer generation limits (default multiple generations; merchant-controlled).
- **Cost control**
  - Default monthly spend cap per shop: **$10**, configurable by merchant.
  - Usage visibility (at minimum: generations + estimated cost).

**Buyer (Storefront)**
- Product-page personalization (app block):
  - Upload **one photo**; optional text (if Blueprint enables it).
  - Generate a premium-looking design and preview it on the product.
  - Allow multiple generations by default (within merchant limits).
  - Add to cart with personalization metadata.

**Fulfillment (Backend)**
- Paid order → produce final print-ready PNG and route to Printify fulfillment.
- **Idempotency** for order-to-Printify creation and **retries** for transient failures.
- Basic logging sufficient to troubleshoot failures.

**Mockups**
- **Printify mockups only** for MVP.

### Out of Scope for MVP

- Multi-POD providers (Printful, etc.)
- Etsy / WooCommerce support
- Advanced/large design library marketplace
- Upscaling, vectorization
- Automated bulk creation of designs/products
- Advanced copyright scanning/enforcement beyond baseline guardrails

### MVP Success Criteria

- Activation: at least **10%** of installs publish multiple products with multiple designs within **24 hours**.
- Performance: p95 generation time stays **< 15 seconds** for the intended flow.
- Outcome: measurable lift in **% of installed stores with ≥1 personalized sale**.
- Monetization validation: at least **1 merchant purchases extra credits** within 30 days.
- Reliability: order → Printify is fully automated in normal cases, with recoverability via logs/retry.

### Future Vision

- Expand starter library into a larger, trend-driven Blueprint catalog (curated styles that sell).
- Add edit-region/inpainting to reduce expensive re-rolls and improve quality.
- Add additional POD providers and additional commerce platforms (Etsy/WooCommerce).
- Add “Coming soon” features surfaced in UI (disabled) to communicate the roadmap without expanding MVP scope.
