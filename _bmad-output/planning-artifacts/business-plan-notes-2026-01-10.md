---
date: 2026-01-10
author: Kevin
source: User notes (translated to English)
type: Notes
project: personalize-design-app
---

# Business Plan Notes (Working)

## One-line problem statement (draft)

Growing POD merchants (10–50 orders/month) struggle to differentiate their brand because current personalization tools are complex and produce generic, low-quality designs—hurting margins and retention.

## What I’m building

A Shopify product personalizer for POD merchants that increases AOV and conversion by:
- Making personalization simple for merchants and customers.
- Helping stores stand out via designs customers actually like.
- Increasing merchant agility (fast design + iteration) and eventually offering a “trendy” design library.
- Staying simple and reliable.

## Business model framing

Value created (MVP + iteration) → Offer → Distribution → Revenue → Retention

## Target customers (hypothesis)

Two types of merchants:
1. Side-business POD sellers
   - Can invest if they see clear upside.
   - Often millennials with a job on the side.
2. Full-time POD operators (e.g., $100k+/month)
   - Larger budgets, international, more professional.
   - Value-driven, business/scale/marketing oriented.

## Core pains

- Differentiation (avoid becoming a commodity).
- Finding a profitable niche/trend.
- Low margins due to many fees.
- Creating designs that actually sell.
- Design creation takes time.
- Fear of copyright issues.
- High friction: existing personalizers are complex, not modern, and output generic designs.
- Desire to reduce support burden (less customer service).

## Why now

- Image-generation/editing models can now create relevant, reliable personalized designs.
- Existing personalizers “have AI”, but merchants still aren’t convinced; many build their own tools.

## Why me (angle / unfair advantage)

- With my skills + AI, I can build what usually takes a whole team.
- I’ve built and sold an AI-based mobile app in the past.
- I have resources and feedback loops to build something that works.

## Distribution (first channels)

- Shopify App Store
- Reddit / Facebook / Discord POD communities
- Micro-influencers (YouTube, TikTok)

## Main challenges (risks)

- Merchant margins may be squeezed by AI costs.
  - Cost control: cheaper model choices, generation limits.
  - Abuse: users re-generate repeatedly to fix defects.
  - Mitigation ideas: draft mode and/or “edit region” (inpainting).
- Trust / perceived likelihood of solving the problem
  - Interactive demo on landing, reviews, example store(s), founder-led demos, strong FAQ (copyright/costs/reliability).
- Quality risks: bad results, slow generation, poor mockups, resolution issues.
- UX friction (too many steps).
- Differentiation risk: easy for incumbents to copy.
- Design library quality risk (if promised later).
- Copyright / restricted content
  - Safeguards and guardrails must be built in.

## Unit economics (hypothesis)

Early Adopter concept (example):
- Installation: free
- Generations: 20 free credits, then $0.05/credit
- Sales fee: $0.25 per personalized order (may be free in early access)
- Safety cap (Shopify capped amount): $50/month (modifiable)

Assumptions:
- Gross margin: achievable (mostly infra + AI costs).
- Churn: lower once merchants have templates and products set up.
- CAC / LTV: unknown (needs real data).

## MVP focus (current)

- ICP: already selling (5–50 orders/month).
- Pain: generic look, design creation time, desire higher margins, difficulty finding winning designs, poor UX in tools like teeinblue/customily, want faster iteration.
- Desired outcome: sell higher-priced items, build passive income, find “winning” designs, build a unique brand.
- Offer (MVP): Shopify app to create “blueprints” (design templates). Customers generate print-ready designs with preview, then the app routes production to POD automatically.
- Pricing (starting points mentioned):
  - $19/month + $0.25 per personalized product sold, or
  - Free install + credits + usage-based billing (early access may be “pay only AI cost”)
- Success metric (30 days): 20 installs + 1 real sale of a personalized product from a merchant.

## Explicit non-goals (MVP)

- Branding, fancy UI, complex funnels, in-product roadmaps.
- Building for everyone.
- Endless UI tweaking instead of talking to customers.
- Switching ideas every 3 days.
- Collecting founder “feedback” instead of buyer validation.
- Becoming a nice-to-have.

Validation = payment.

## MVP features (draft)

Admin app:
- Onboarding
- Core feature: blueprint creation (high-quality personalized design templates)
- Payments / billing
- Feedback button in multiple places

Blueprint creation:
- Name, prompt with variables, optional image reference
- Optional remove background + mask
- Model choice + cost visibility
- “Test blueprint” experience inside admin

Products / assignment:
- Assign blueprint(s) to one or more products
- Auto-fit to print area OR manual placement per print area/variant
- Mockup generation using Printify mockups for now

Storefront:
- App block on product page
- Customer inputs: upload 1 photo + text
- Generate print-ready PNG + mockup preview
- Optional edit-region (inpainting) to reduce expensive re-rolls
- Add to cart with personalization metadata

Backend:
- App Proxy APIs
- Order → create Printify order with final print file
- Rate limiting / cost control

## Merchant flow (high-level)

1. Install the app
2. Onboarding stepper
   - Founder note: alpha, prefer test store, how to leave feedback, short demo video
   - Paywall / promo (early access)
   - Connect Printify API key (other POD providers as “coming soon”)
   - Enable the theme app block
   - Billing setup: managed key and/or BYOK for fal.ai
   - Redirect to create first blueprint
3. Create blueprint → test → assign to product(s)
4. Dashboard + usage + logs/debug

## Customer flow (high-level)

Product page → fill inputs → generate image → preview mockup → optional edit region → add to cart → checkout → order triggers Printify fulfillment.

## Billing concept (notes)

- 1 credit = $0.05
- 20 credits gifted on install
- Model costs vary (e.g., 1.0 credit vs 1.5 credits)
- Tools (remove bg) add credit cost
- Monthly capped amount for safety

## Workflow orchestration (notes)

- Monolith is fine for MVP.
- Inngest: embed dev server for MVP, later self-host via Docker.
