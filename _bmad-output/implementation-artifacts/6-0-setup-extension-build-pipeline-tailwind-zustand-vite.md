# Story 6.0: Setup Extension Build Pipeline (Tailwind + Zustand + Vite)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the storefront theme app extension build pipeline wired for Tailwind + Zustand + Vite,
so that the personalization hub UI can be authored in modern UI primitives and reliably shipped as extension assets.

## Acceptance Criteria

1. A theme app extension block for the personalization hub exists and mounts the JS/CSS bundle in the storefront product page block.
2. The extension assets output includes `personalize-stepper.js` and `personalize-stepper.css` under `extensions/personalize-design-app/assets/`.
3. Tailwind is configured for the extension bundle with shadcn-style tokens and does not leak styles into the admin app.
4. Zustand is available for the storefront bundle (single source of truth for stepper state) without polluting the admin bundle.
5. The Vite build pipeline supports building the extension assets and does not break the existing React Router app build.
6. Extension build/dev workflow is documented in scripts or README references so developers can run and verify locally.

## Tasks / Subtasks

- [ ] Define the personalization hub extension entrypoints and asset outputs (AC: 1, 2, 5)
  - [ ] Add/create the Liquid block for the storefront stepper mount
  - [ ] Create JS/CSS entrypoints for the storefront bundle
- [ ] Configure Tailwind + shadcn-style tokens for the extension bundle (AC: 3)
  - [ ] Scope Tailwind build to extension assets only
- [ ] Add Zustand to the storefront bundle entrypoint and ensure isolation from admin app (AC: 4)
- [ ] Update Vite build pipeline to build extension assets alongside app build (AC: 2, 5, 6)
  - [ ] Confirm dev workflow for building extension assets locally
- [ ] Add minimal verification notes (manual) and usage instructions (AC: 6)

## Dev Notes

- Storefront stepper bundle lives in the theme app extension: `extensions/personalize-design-app/blocks/` for Liquid and `extensions/personalize-design-app/assets/` for JS/CSS. [Source: _bmad-output/planning-artifacts/architecture.md#Requirements to Structure Mapping]
- Storefront UI stack is Tailwind + shadcn-style primitives with Zustand for stepper state (single source of truth). [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture]
- Desktop storefront flow is embedded in the product page block (no modal for core flow); mobile is full-screen stepper. [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Platform Strategy]
- The storefront stepper must be mounted via theme app extension block (Liquid) and load JS/CSS assets without impacting admin UI styling. [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries]
- Use standard error envelope and `snake_case` payloads only when proxy endpoints are introduced later (not in this setup story). [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns]

### Project Structure Notes

- Extension assets path: `extensions/personalize-design-app/assets/` (expected outputs: `personalize-stepper.js`, `personalize-stepper.css`).
- Extension block path: `extensions/personalize-design-app/blocks/personalize_stepper.liquid` (create if missing).
- Avoid introducing a second app framework; keep the existing React Router + Vite build pipeline intact. [Source: _bmad-output/planning-artifacts/architecture.md#Starter Template Evaluation]

### References

- \_bmad-output/planning-artifacts/architecture.md#Frontend Architecture
- \_bmad-output/planning-artifacts/architecture.md#Requirements to Structure Mapping
- \_bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries
- \_bmad-output/planning-artifacts/ux-design-specification.md#Platform Strategy

## Dev Agent Record

### Agent Model Used

OpenCode (model version unknown)

### Debug Log References

### Completion Notes List

### File List
