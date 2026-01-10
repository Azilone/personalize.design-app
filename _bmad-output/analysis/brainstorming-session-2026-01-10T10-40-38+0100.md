---
stepsCompleted: [1, 2]
inputDocuments: []
session_topic: 'Technical architecture + code structure for Shopify POD personalization MVP'
session_goals: 'Clarify the end-to-end technical setup (storefront app block flow, Printify mapping + order creation, Inngest workflows self-hosted later, R2 storage, fal.ai generation, billing/credits/capped amount) and define a minimal repo/module structure to implement.'
selected_approach: 'progressive-flow'
techniques_used: ['Question Storming', 'Ecosystem Thinking', 'Morphological Analysis', 'Chaos Engineering']
ideas_generated: []
context_file: ''
---

# Brainstorming Session Results

**Facilitator:** Kevin
**Date:** 2026-01-10T10:17:23Z

## Session Overview

**Topic:** Technical architecture + code structure for Shopify POD personalization MVP
**Goals:** Clarify the end-to-end technical setup and produce an implementable structure.

### Context Guidance

_No context file provided._

### Session Setup

**Known constraints / decisions (v1):**
- Hosting: VPS via Dockploy (monolith)
- Storage: Cloudflare R2
- AI provider: fal.ai only
- Storefront UX: product page app block
- Customer flow: upload 1 photo + text, regenerate with limits, then buy
- Output: single print-ready PNG per order line
- Mockups: Printify mockups
- Orchestration: Inngest dev server now; later self-host Inngest via Docker
- Billing: free credits -> Shopify usage billed; support both managed key + BYOK

**Open questions to resolve:**
- Shopify <-> Printify product mapping strategy
- When/how Printify orders are created from Shopify orders
- How to represent per-variant print areas + manual placement
- Production workflow execution details once Inngest is self-hosted

## Technique Selection

**Approach:** Progressive Technique Flow  
**Journey Design:** Systematic development from exploration to action

**Progressive Techniques:**

- **Phase 1 — Exploration:** Question Storming (generate questions only; surface unknowns)
- **Phase 2 — Pattern Recognition:** Ecosystem Thinking (map actors/systems + boundaries)
- **Phase 3 — Development:** Morphological Analysis (enumerate architecture choices and pick MVP)
- **Phase 4 — Action Planning:** Chaos Engineering (stress-test reliability + billing/order integrity)

**Journey Rationale:** Your goal is an implementable MVP architecture; we start by enumerating unknowns (not assumptions), then structure the system, decide the MVP parameter set, and finally harden it against the real failure modes (webhooks, retries, double-billing, order idempotency, storage failures).
