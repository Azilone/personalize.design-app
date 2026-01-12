---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/product-brief-personalize-design-app-2026-01-10.md
project_name: personalize-design-app
author: Kevin
date: 2026-01-10T14:42:23Z
workflow: create-ux-design
lastStep: 14
---

# UX Design Specification personalize-design-app

**Author:** Kevin
**Date:** 2026-01-10T14:42:23Z

---

<!-- UX design content will be appended sequentially through collaborative workflow steps -->

## Executive Summary

### Project Vision

Personalize Design is a multi-tenant Shopify app for POD merchants (Printify-first) that enables simple, premium personalization that looks good enough to sell. Merchants create reusable design templates (“Blueprints”) and assign them to products; buyers personalize directly on the product page (photo + optional text), generate a premium design, preview it on-product via mockups, and purchase. After purchase, the system produces print-ready PNGs per order line and automates fulfillment to Printify, matching expected Shopify/Printify behavior (hands-off unless something fails operationally).

### Target Users

- Merchant (Primary): Solo POD seller (5–50 orders/month), Canva-level, motivated by speed-to-market, differentiation, and low operational burden. Needs a fast path to a sellable template with predictable cost and reliable fulfillment.
- Buyer (Secondary): Gift buyer seeking an easy, mobile-first customization flow, fast generation, and high confidence the preview matches the final product.

### Key Design Challenges

- Delivering a premium-feeling outcome with minimal setup and no heavy editor in MVP, while reliably hitting the “wow I love the result, I want this mug” moment.
- Establishing trust in preview fidelity (mockups, expectation-setting, and clear states) while keeping the flow fast and simple.
- Making limits (tries left) feel fair and understandable, while protecting unit economics and system stability.

### Design Opportunities

- A guided “stepper” storefront UX that keeps users oriented and reduces cognitive load:
  - Desktop: stepper experience
  - Mobile: full-screen stepper (mobile-first)
- A buyer flow optimized for the emotional peak: the preview/result is the hero, and the UI supports confidence and momentum into “Add to cart”.
- Premium, consistent UI foundation for MVP using Solaris UI, creating a clean, trustworthy feel with minimal custom design overhead.

### Defaults & Guardrails (MVP)

- Default generation limits (merchant-configurable):
  - 5 generations max per product
  - 15 generations max per user session
  - Reset window: ~30 minutes
- Failure handling UX: “Try again” as the primary recovery path (with clear messaging and state design).

## Core User Experience

### Defining Experience

**Merchant core loop (most frequent + most critical):**
Create a design template (“Blueprint”) that reliably produces premium-looking outputs, then assign it to a Shopify product and confirm it works end-to-end with a trustworthy mockup preview. The “aha” moment is the first generated design that looks sellable.

**Buyer core loop:**
Inside the Shopify product page, upload a photo and generate a personalized design preview with minimal friction. The experience should feel easy end-to-end, with the primary success moment being “I love this result, I want this mug”.

### Platform Strategy

- **Primary surface:** Shopify product page app block.
- **Desktop interaction model:** stepper contained within the product page block (no overlay/modal on desktop).
- **Mobile interaction model:** full-screen stepper (mobile-first).
- **Inputs constraints:** none specified for MVP (keep upload friction low; handle edge cases gracefully).

### Effortless Interactions

- **Merchant:** creating a template, assigning it to a product, and validating the mockup preview should be straightforward and repeatable.
- **Buyer:** upload → generate → preview → add to cart should feel simple and guided (stepper).
- **Ops/recovery:** fulfillment and recovery workflows should be designed to minimize manual effort and reduce “stuck” states (clear retries/idempotency-aware UX where relevant).

### Critical Success Moments

- **Merchant success moment:** first generated design output feels premium/sellable.
- **Buyer success moment:** sees a personalized preview they love and feels confident buying.
- **Make-or-break risks:**
  - slow generation (drop-off)
  - bad personalization results (trust breaks, churn)

### Experience Principles

- **Mobile-first guided flow:** default to a stepper that keeps users oriented.
- **Result is the hero:** optimize UI for confidence in the generated preview and momentum into purchase.
- **Contain complexity:** keep desktop in-block (no modal), keep steps minimal, avoid advanced controls unless necessary.
- **Recovery over perfection:** prioritize resilient fulfillment/retry behaviors and clear failure states over complex editing features.
- **Premium baseline UI:** use Solaris UI for MVP to keep the experience consistent and trustworthy.

### Open Decisions (TBD)

- What should happen automatically vs explicitly (e.g., auto-select template, auto-save drafts, auto-regenerate, auto-apply best mockup).

## Desired Emotional Response

### Primary Emotional Goals

- **Buyer (storefront):** confident desire — “I want this mug” because the preview feels premium and believable.
- **Merchant (admin):** in control, confident, excited — “I can ship sellable personalization fast without surprises.”
- **Emotions to reinforce:** confident, trustworthy.
- **Emotions to avoid:** disappointed (from slow generation, low-quality results, or preview mismatch).

### Emotional Journey Mapping

**Buyer journey**

- **First encounter (product page):** confident that this will be easy and worth trying.
- **During generation/loading:** trust that it’s working and will produce a credible result.
- **If something goes wrong:** determined to try again (clear path forward; no dead ends).
- **On success (preview):** desire and satisfaction — “this looks great; I want it.”

**Merchant journey**

- **First-time setup:** in control (clear steps and predictable outcomes).
- **First generation:** excitement + confidence when the result looks sellable.
- **Publishing/assigning to product:** confidence that storefront and mockups will behave as expected.
- **When ops issues happen:** calm confidence via recoverability (retry/reprocess) and clear status.

### Micro-Emotions

- **Confidence over confusion:** clear steps, plain-language actions, and unambiguous states.
- **Trust over skepticism:** honest progress/loading, reliable previews, and transparent guardrails.
- **Satisfaction over “meh”:** the output quality and preview polish leave users feeling it’s “good enough to buy/sell.”

### Design Implications

- **Confidence →** stepper UX with explicit progress, strong defaults, and minimal required decisions.
- **Trust →** high-quality loading states, predictable retries (“Try again”), and messaging that sets expectations without overpromising.
- **Satisfaction/desire →** make the generated result + mockup preview the visual focus; minimize UI noise; keep “Add to cart” momentum obvious.
- **Avoid disappointment →** prioritize speed and perceived speed, fail gracefully, and ensure preview fidelity is treated as a core product constraint.

### Emotional Design Principles

- **Clarity beats cleverness:** users should always know what to do next.
- **Make progress legible:** show what’s happening during generation and why retries help.
- **Protect trust:** never surprise users with hidden constraints; keep guardrails understandable.
- **Celebrate the result:** treat the generated preview as the hero moment.

## UX Pattern Analysis & Inspiration

### Inspiring Products Analysis

**Shopify Admin (Polaris)**

- Strong information hierarchy for “configure → validate → publish” workflows.
- Reliable system feedback patterns (banners, toasts, inline errors) that build trust.
- Clear empty states and guided next steps that reduce confusion for first-time setup.
- Predictable “save” mental model (draft vs active, change awareness, confirmation).

**Storefront UI direction (shadcn UI + component gallery ecosystems)**

- Premium-minimal visual language: clean typography, whitespace, crisp controls, and clear emphasis on the primary action.
- Composable patterns that support building a stepper UX with consistent spacing and predictable states.
- Emphasis on clarity and affordances (users know what’s clickable/next) which supports buyer confidence inside a constrained block.

**Motion / delight libraries (e.g., Magic UI-style patterns)**

- Tasteful micro-motion can increase perceived quality and satisfaction, but must never slow down or distract from the result (preview is the hero).

### Transferable UX Patterns

**Navigation Patterns**

- Merchant: resource list → detail/editor pattern for templates; clear sections; simple wayfinding.
- Buyer: linear stepper with explicit progress and a single primary CTA per step; mobile full-screen stepper for focus.

**Interaction Patterns**

- Upload-first flow: immediate preview of selected photo; clear replace/remove actions.
- Generation states: legible progress, “Try again” recovery, and no dead ends.
- Quotas/limits: “tries left” + reset timer messaging that feels fair and transparent.
- Preview-first layout: generated result and mockup preview are visually dominant; UI chrome stays minimal.

**Visual Patterns**

- Premium minimal styling with a consistent system (Solaris UI for MVP foundation).
- Strong contrast for primary actions, restrained color use, and calm error styling to preserve trust.

### Anti-Patterns to Avoid

- Desktop modal/overlay flows for the product-page experience (conflicts with block constraints).
- Over-configuration and “complex editor” UX in MVP (increases confusion; slows time-to-value).
- Hidden guardrails (limits/billing surprises) that create skepticism and disappointment.
- Excessive motion or novelty components that distract from speed or perceived quality.

### Design Inspiration Strategy

**What to Adopt**

- Polaris-style structure and feedback patterns for merchant admin (clarity, trust, predictable states).
- Premium-minimal component aesthetics for storefront (clean hierarchy; result-first layout).

**What to Adapt**

- Stepper UX adapted to Shopify product page block constraints (desktop embedded; mobile full-screen).
- Limit/try-again patterns tuned to “confident → trustworthy → determined → desire”.

**What to Avoid**

- Modal-heavy flows on desktop storefront.
- Feature density and micro-interactions that compete with speed or perceived quality.

## Design System Foundation

### 1.1 Design System Choice

**Merchant Admin (embedded app):** Shopify Polaris  
**Storefront (product page block + mobile full-screen):** shadcn UI-style component system (Tailwind-based), tailored to the buyer stepper experience.

### Rationale for Selection

- **Polaris for admin:** maximizes familiarity for merchants, aligns with Shopify conventions, and accelerates building reliable “configure → validate → publish” workflows with trusted feedback patterns.
- **shadcn UI for storefront:** supports a premium-minimal aesthetic where the generated result is the hero, while keeping components composable for a stepper-based flow and predictable UI states.
- **Context fit:** admin and storefront are fundamentally different surfaces; using different foundations is acceptable as long as each surface is internally consistent.

### Implementation Approach

- **Admin:** use Polaris components and patterns end-to-end (navigation, resource lists, forms, banners/toasts, save states).
- **Storefront:** use shadcn UI primitives/patterns to implement:
  - Desktop: embedded stepper inside the app block (no modal/overlay)
  - Mobile: full-screen stepper (mobile-first)
  - Strong loading/progress + retry states to support trust and determination

### Customization Strategy

- Keep storefront styling restrained and consistent (typography, spacing, and primary action emphasis).
- Use minimal motion (optional) only where it improves perceived quality without slowing the flow.
- Ensure storefront UI clearly communicates limits (tries left + reset window) and supports “Try again” recovery without dead ends.

## 2. Core User Experience

### 2.1 Defining Experience

**Defining experience (merchant):**
“Create a sellable, premium personalization template in minutes, assign it to a product, and trust that buyers will generate results that look artist-made.”

This is the interaction that makes the product feel “next generation”: fast setup, high-quality outputs, and confidence that it will work in real storefront conditions.

### 2.2 User Mental Model

**Buyer mental model**

- Buyers experience this as a **personalized product/gift store** flow (not an “AI tool”).
- Expectation: simple personalization that produces a believable preview quickly, with minimal fuss.

**Merchant mental model**

- Merchants see this as a **next-generation product customizer**: create a reusable template/Blueprint that drives a consistent storefront personalization experience.
- Expectation: template-driven setup, quick validation, and dependable output quality that sells.

### 2.3 Success Criteria

- **Speed:** generation feels fast; target p95 generation time is **≤ 15s**.
- **Quality bar:** outputs look **clean** and **artist-made** (premium, cohesive, sellable), not generic or “AI-weird”.
- **Confidence signals:**
  - clear preview/mocked-on-product presentation
  - predictable retries when needed
  - guardrails that prevent surprise disappointment (limits + reset)

### 2.4 Novel UX Patterns

- **Established patterns (use them):**
  - merchant “template builder” workflows (create → test → publish → assign)
  - buyer stepper flows and clear state design (upload → generate → preview → add to cart)
- **Novel twist (where we must be excellent):**
  - consistently premium results within tight performance budgets
  - “magic” that stays invisible: buyers should feel they’re shopping a personalized gift, not operating a complex generator

### 2.5 Experience Mechanics

**Merchant: create a sellable template**

1) **Initiation**

- Entry point: “Create template/Blueprint” with a clear promise (fast path to a sellable result).

2) **Interaction**

- Define the template inputs (photo required; optional text if enabled).
- Run test generation(s) quickly to validate the look.
- Iterate until it meets the “artist-made” quality bar.
- Assign template to a product and confirm mockup/preview behavior.

3) **Feedback**

- Strong quality feedback loop: preview-first layout; clear “this is working” states.
- If generation fails: “Try again” with clear next action and no dead end.

4) **Completion**

- Template is publishable and assigned to a product; merchant feels confident it will convert.

**Buyer: personalize inside the product page block**

1) **Initiation**

- Clear invite inside the product page block (mobile-first).

2) **Interaction**

- Upload photo → generate → view preview.

3) **Feedback**

- Trustworthy progress during generation; clear retry path if needed.

4) **Completion**

- Buyer sees a clean, premium result and proceeds to add to cart.

## Visual Design Foundation

### Color System

**Approach**

- **Base:** neutral, high-contrast foundation (white/black/gray) to keep the UI premium and keep focus on the generated result.
- **Accent:** **merchant-configurable** brand accent color set in admin and applied to storefront CTAs/highlights (primary buttons, active step, progress, focus ring).
- **Surfaces:**
  - **Admin:** Polaris styling/patterns; accent may appear in limited places only if Polaris supports it cleanly.
  - **Storefront:** shadcn UI token system (CSS variables) with a theme layer that injects merchant accent.

**Semantic tokens (storefront)**

- `bg`, `fg`, `muted`, `muted-fg`
- `card`, `card-fg`
- `border`, `ring`
- `primary` (maps to merchant accent), `primary-fg`
- `secondary`, `secondary-fg`
- `destructive`, `destructive-fg`
- `success`, `warning`, `info` (used sparingly; avoid noisy UI)

**Theming strategy**

- Store the merchant-selected accent in shop settings.
- Derive accessible variants (hover/active) and text-on-accent (`primary-fg`) to maintain contrast.
- Keep “Try again”, limits, and error states calm (trust-preserving), not alarming.

### Typography System

- **Font:** default system used by the stack (Inter OK as default).
- **Hierarchy:** clear, modern type scale with strong headings and readable body.
- **Tone:** bold/modern via weight + spacing, not gimmicks; keep copy concise and action-oriented.

Suggested scale (storefront)

- Page/step title: `text-xl` / `text-2xl` (weight 600–700)
- Section labels: `text-sm` (weight 500–600)
- Body: `text-sm` / `text-base` (weight 400–500)
- Helper text: `text-xs` / `text-sm` (muted)

### Spacing & Layout Foundation

- **Base unit:** 8px grid (balanced density).
- **Layout principles**
  - **Result-first:** preview/mockup gets the most space; controls stay compact.
  - **Stepper clarity:** one primary action per step; clear spacing between steps and the hero preview.
  - **Inside-block constraint (desktop):** avoid layouts that require overlays; keep flows linear and vertically scannable.
  - **Mobile-first:** full-screen stepper uses safe-area padding, sticky primary CTA as needed, and generous tap targets.

Suggested spacing tokens

- Component padding: 12–16px
- Step sections: 16–24px vertical rhythm
- Primary CTA area: consistent bottom spacing; avoid jumps between states

### Accessibility Considerations

- Maintain contrast ratios for text and controls, especially with merchant-selected accent colors.
- Ensure focus rings are visible (use `ring` token; don’t rely on color alone).
- Large touch targets on mobile (44px+).
- Loading/progress states communicate status clearly (avoid ambiguous spinners only; add short, clear status text).
- Error states: calm messaging + deterministic next action (“Try again”), avoiding blamey language to prevent disappointment.

## Design Direction Decision

### Design Directions Explored

We explored 8 storefront design directions for the buyer stepper (desktop embedded Shopify product-page block + mobile full-screen), with a merchant-configurable accent color.

### Chosen Direction

**Chosen base:** Direction 1 (Result-First Minimal)  
**Incorporate:** more legible progress (bar-style) and dual-CTA layout *only in the post-result state* (Add to cart primary, Try again secondary).

### Design Rationale

- Maximizes **confidence + trust** by keeping the UI simple and states clear.
- Maximizes **satisfaction/desire** by making the generated preview the hero and reducing visual noise.
- Supports constraints: embedded desktop block (no modal) and mobile full-screen stepper.
- Reduces disappointment risk by keeping retry always available without stealing focus from the buy moment.

### Implementation Approach

- Use shadcn UI components with neutral base tokens + merchant accent for primary actions and active progress.
- Stepper layout:
  - Desktop: embedded stepper inside the block
  - Mobile: full-screen stepper with sticky primary CTA
- Post-result actions: show **Add to cart** (primary) + **Try again** (secondary) with “tries left” + reset window messaging.

## User Journey Flows

### Merchant — Onboarding → Create/Test Template → Assign → Mockup Test → Go Live

Goal: merchant creates a sellable template, validates the end-to-end preview/mockup, and launches fast with confidence.

```mermaid
flowchart TD
  A[Install app] --> B[Onboarding start]
  B --> C{Early access code required?}
  C -->|Yes| D[Enter EARLYACCESS code]
  C -->|No| E[Continue]
  D --> E[Continue]
  E --> F[Connect Printify]
  F --> G{Printify connected OK?}
  G -->|No| F1[Fix connection / retry] --> F
  G --> H[Verify products exist (Printify-synced)]
  H --> I[Create design template (Blueprint)]
  I --> J[Test generate (preview)]
  J --> K{Result meets “artist-made” bar?}
  K -->|No| J1[Adjust template + Try again] --> J
  K --> L[Configure storefront defaults\n(tries limits, reset window)]
  L --> M[Assign template to a product]
  M --> N[Test result by generating mockup/preview]
  N --> O{Preview/mockup trustworthy?}
  O -->|No| N1[Fix template/config + re-test] --> N
  O --> P[Go live]
```

### Buyer — Product Page → Personalize & Order → Upload → Generate → Preview → Add to Cart → Pay

Goal: buyer feels confident, gets a clean premium result fast, and purchases.

```mermaid
flowchart TD
  A[Shopper visits product page (e.g., mug)] --> B[Clicks “Personalize & Order”]
  B --> C[Stepper opens\nDesktop: embedded block\nMobile: full-screen]
  C --> D[Upload photo]
  D --> E[Generate preview]
  E --> F{Generation success?}
  F -->|No| F1[Show error + “Try again”\n(no dead end)] --> E
  F --> G[Preview result + mockup]
  G --> H{Love the result?}
  H -->|No| I{Tries remaining?}
  I -->|Yes| E
  I -->|No| I1[Limit reached + reset timer (~30m)\nExplain next step] --> J[Wait/reset OR stop]
  H -->|Yes| K[Add to cart with personalization metadata]
  K --> L[Checkout + Pay]
```

### Post-Purchase — Shopify Paid Order → Printify Sync/Fulfillment (Automated)

Goal: after payment, fulfillment behaves like standard Shopify↔Printify flow; our app ensures the personalized print asset is available for the Printify order item.

```mermaid
flowchart TD
  A[Buyer pays (Shopify order paid)] --> B[Shopify→Printify order sync (Printify automation)]
  B --> C{Personalization metadata present?}
  C -->|No| D[Printify fulfills normally]
  C -->|Yes| E[App generates final print-ready asset]
  E --> F[Attach/update asset for the Printify order item\n(via integration path)]
  F --> G{Asset accepted/linked?}
  G -->|No| G1[Retry / reprocess / manual ops fallback] --> F
  G --> H[Printify fulfills order automatically]
```

### Journey Patterns

- Stepper-first guidance (one primary action per step; mobile-first full-screen).
- Result-first hierarchy (preview/mockup is the hero; minimize UI noise).
- Deterministic recovery (“Try again” always available; no dead ends).
- Guardrails that preserve trust (tries left + reset timer messaging).

### Flow Optimization Principles

- Optimize for speed and perceived speed (p95 ≤ 15s target; clear progress states).
- Prevent disappointment by validating preview fidelity and keeping expectations honest.
- Keep merchant time-to-first-sellable template low (fast loop: create → test → assign → mockup test → live).

## Component Strategy

### Design System Components

**Admin (Polaris)**

- Page layout: `Page`, `Layout`, `Card`, stack/layout primitives
- Navigation: tabs/sections, breadcrumbs
- Inputs: text fields, selects, toggles, validation states
- Feedback: banners, toasts, inline errors, loading indicators
- Data views: resource lists/tables for templates and products
- Empty states: guided onboarding cards and “next step” prompts

**Storefront (shadcn UI-style)**

- Foundation: `Button`, `Input`, `Card`, `Badge`, `Tabs`, `Progress`, `Skeleton`, `Toast`
- Stepper scaffolding: composable layout primitives + progress indicator
- Media: image containers, aspect-ratio wrappers, lightweight preview chrome

### Custom Components

### MerchantAccentColorPicker (Admin)

**Purpose:** Merchant sets a single accent color applied to storefront CTA/highlights.  
**Usage:** Settings page + optional onboarding step.  
**Anatomy:** label, color input, hex field, preview swatch, “reset to default”.  
**States:** default, invalid hex, saving, saved.  
**Accessibility:** labeled inputs; announce save success/fail.  
**Behavior:** persist per shop; generate safe derived tokens for hover/active/text contrast.

### TemplateBuilder (Admin)

**Purpose:** Create/edit a design template (“Blueprint”) with inputs + generation config.  
**Usage:** Template create/edit flow.  
**Anatomy:** template name/status, inputs config (photo required; optional text), generation settings, test panel.  
**States:** draft, saving, publishable, published, error.  
**Accessibility:** form semantics, field-level errors, keyboard navigation.  
**Behavior:** supports rapid iterate→test loop; clear “publish/assign-ready” signal.

### TemplateTestPanel (Admin)

**Purpose:** Generate test outputs and validate “artist-made” quality bar.  
**Usage:** Inside TemplateBuilder.  
**Anatomy:** upload input, generate button, progress/skeleton, result gallery, thumbs up/down.  
**States:** idle, uploading, generating, success, failure (Try again).  
**Behavior:** deterministic retry; shows clear error messaging.

### ProductAssignmentPanel (Admin)

**Purpose:** Assign one or more templates to a Shopify product and configure storefront defaults.  
**Usage:** Product detail or assignment wizard.  
**Anatomy:** product selector, assigned templates list, ordering/default template, limits settings (5 per product, 15 per session, reset ~30m), save/publish.  
**States:** empty, configured, saving, saved, error.  
**Behavior:** supports multiple templates per product; allows enable/disable per template.

### TemplatePicker (Storefront)

**Purpose:** Buyer selects a template when multiple templates are available for a product.  
**Usage:** Step 1 of the buyer stepper when >1 template assigned.  
**Anatomy:** template cards (name + small preview), selected state, “continue” CTA.  
**States:** loading, selectable, selected, disabled/unavailable.  
**Accessibility:** radio-group semantics; keyboard navigation.

### PersonalizeStepperShell (Storefront)

**Purpose:** Core buyer stepper container (desktop embedded block; mobile full-screen).  
**Usage:** Entire storefront flow.  
**Anatomy:** step header, progress (bar-style), step content, sticky primary CTA area (mobile).  
**States:** idle, in-progress, completed, blocked (limits).  
**Accessibility:** focus management between steps; visible focus ring; announces step changes.

### GenerationResultViewer (Storefront)

**Purpose:** Show generated image as the hero + key actions (Add to cart primary; Try again secondary).  
**Usage:** Post-generation step.  
**Anatomy:** hero preview, status pill, “Add to cart”, “Try again”, tries remaining + reset timer.  
**States:** generating (progress), success, failure (Try again), limit reached.  
**Accessibility:** clear status text; buttons labeled; avoid color-only status.

### MockupPreviewLauncher (Storefront)

**Purpose:** Let buyer view Printify mockups after generation.  
**Usage:** Post-generation; “Preview” button below the generated hero.  
**States:** loading mockups, ready, error.  
**Behavior:** uses Printify-generated mockups; does not block add-to-cart.  
**Open decision (desktop):** product page block constraints vs modal requirement (resolve as inline expand/collapse, new tab, or allow modal).

### Component Implementation Strategy

- Admin uses Polaris end-to-end; custom Polaris-compatible components only where necessary (accent color picker, specialized test panel).
- Storefront uses shadcn UI primitives with a neutral base and merchant accent mapped to primary actions/progress.
- Treat loading/progress and retry as first-class components (trust + determination).

### Implementation Roadmap

**Phase 1 (must-have MVP)**

- TemplateBuilder + TemplateTestPanel
- ProductAssignmentPanel (multiple templates per product)
- PersonalizeStepperShell + GenerationResultViewer
- Add-to-cart integration with personalization metadata

**Phase 2 (conversion + confidence)**

- TemplatePicker (storefront) for multi-template products
- MockupPreviewLauncher (finalized desktop behavior)

**Phase 3 (polish/ops)**

- Better error states, diagnostics hooks, and admin visibility for failures
- Enhanced quality feedback and template performance metrics

## UX Consistency Patterns

### Button Hierarchy

**Storefront (buyer)**

- **Primary CTA (by step):**
  - Pre-generation: **Generate preview**
  - Post-result: **Add to cart**
- **Secondary CTA (by step):**
  - Post-result: **Try again**
  - All steps: **Back** (where applicable) and **Close** (mobile full-screen)
- **Destructive actions:** avoid on storefront; if needed, label explicitly (e.g., “Remove photo”) and never style as primary.
- **Disabled states:** explain why (“No tries left — resets in ~30 minutes”).

**Admin (merchant)**

- Primary: **Save**, **Publish**, **Assign**
- Secondary: **Cancel**, **Back**
- Destructive: **Delete template** (confirm required)

### Feedback Patterns

**Loading/progress**

- Use **progress + short status text** (not spinner-only), e.g., “Generating preview…”.
- Prefer **skeletons** for preview areas to maintain layout stability.
- Surface perceived-speed cues (step remains visible; hero preview frame stays in place).

**Success**

- Confirm success with restrained feedback (toast/badge): “Added to cart”, “Template saved”, “Published”.
- After generation success, shift attention to the **result hero** and the **Add to cart** CTA.

**Errors**

- Storefront errors default to a single deterministic action: **Try again**.
- Error copy is calm and trust-preserving (“Something went wrong. Try again.”) with optional “details” only if useful.
- Admin errors include actionable remediation (e.g., reconnect Printify, check prerequisites).

**Limits/reset**

- Always show “tries left” near the primary interaction area.
- When limit reached: show reset timer (~30 minutes) and what happens next (wait, try later).

### Form Patterns

**Admin forms (Polaris)**

- Validate on blur + on submit; show field-level errors inline.
- Use progressive disclosure: keep the “happy path” minimal; hide advanced options behind “Advanced”.
- Save states: clear unsaved-changes indication and explicit “Saved” confirmation.

**Accent color input**

- Single accent color per shop.
- Require valid hex; preview swatch updates immediately.
- Ensure accessible contrast derivation for primary text/icon on accent.

### Navigation Patterns

**Admin**

- Resource list → detail/editor pattern:
  - Templates list → TemplateBuilder (create/edit/test/publish)
  - Products list → ProductAssignmentPanel (assign/enable/limits)
- Onboarding is a linear checklist with clear “next action”.

**Storefront**

- Stepper navigation:
  - Desktop: contained inside product page block (no navigation away)
  - Mobile: full-screen stepper with Back/Close and sticky primary CTA where helpful
- One primary action per step; avoid branching unless needed (e.g., template picker only when multiple templates exist).

### Modal and Overlay Patterns

**Storefront**

- Modal is acceptable for **mockup preview** on desktop (invoked by a “Preview mockups” button post-generation).
- Modal behavior:
  - Focus-trapped, dismissible via X and ESC
  - Supports swipe/arrow navigation across multiple Printify mockups
  - “Add to cart” remains available outside the modal (modal is informational, not gating)
- Avoid modal use for core stepper progression; keep the core flow embedded.

### Additional Patterns

**Empty states (admin)**

- Templates empty: explain value + single “Create template” primary action.
- Products unassigned: show “Assign templates to products” guidance.

**Content tone**

- Buyer-facing: premium gift-store tone; avoid “AI” language.
- Merchant-facing: direct and operational (“sellable”, “cost”, “limits”, “publish”).

## Responsive Design & Accessibility

### Responsive Strategy

**Storefront (buyer)**

- **Mobile-first default:** full-screen stepper with sticky primary CTA where helpful.
- **Desktop:** embedded stepper inside the Shopify product page block (no layout that depends on overlays for the core flow).
- **Tablet:** treat as touch-first; stepper remains linear with generous tap targets and stable layout.
- **Result-first layout:** the generated result + preview remain the visual anchor across breakpoints.

**Admin (merchant)**

- Polaris-responsive layouts with predictable page structure:
  - list → detail/editor flows stay readable at all sizes
  - forms remain scannable; avoid dense multi-column forms on small screens

### Breakpoint Strategy

Use standard breakpoints:

- **Mobile:** 320px–767px
- **Tablet:** 768px–1023px
- **Desktop:** 1024px+

Implementation approach: mobile-first CSS with progressive enhancement for tablet/desktop.

### Accessibility Strategy

Target **WCAG 2.1 AA** for storefront and admin.

Key requirements:

- **Keyboard navigation:** all interactive elements reachable and operable via keyboard.
- **Visible focus:** clear focus rings (especially in the storefront stepper and modal).
- **Contrast:** ensure text and controls meet AA contrast, including merchant-selected accent colors (derive accessible foreground).
- **Screen reader semantics:** semantic HTML for forms and stepper structure; descriptive labels for buttons.
- **Touch targets:** minimum 44×44px on mobile.
- **Modal a11y:** mockup preview modal is focus-trapped, ESC dismissible, and returns focus to the launcher button.

### Testing Strategy

**Responsive**

- Test on iPhone + Android (real devices), plus common desktop widths.
- Verify Shopify product page block constraints across themes (layout stability).

**Accessibility**

- Keyboard-only pass for storefront and admin critical flows.
- Screen reader spot checks (VoiceOver recommended baseline).
- Automated checks (e.g., axe) as a regression guard.

### Implementation Guidelines

- Use semantic HTML first; add ARIA only where needed.
- Avoid relying on color alone for state; pair with text/badges.
- Keep layout stable during generation (skeletons + reserved preview area).
- Ensure merchant accent theming always computes readable `primary-fg` and focus ring styles.
