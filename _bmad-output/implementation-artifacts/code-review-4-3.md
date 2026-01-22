# Code Review Findings: Story 4.3

**Reviewer:** BMad Workflow Engine
**Date:** 2026-01-22

**Story:** `_bmad-output/implementation-artifacts/4-3-merchant-product-preview-simulator-only-when-configured.md`
**Git vs Story Discrepancies:** 1 found (Story file likely new/untracked in git status, but implementation files are committed).
**Issues Found:** 2 High, 1 Medium, 0 Low

## 🔴 CRITICAL ISSUES
- **AC 3.3 Not Implemented (Multiple Images)**: The Acceptance Criteria specifies "Test-Generate (1-4)". The current implementation is hardcoded to generate 1 image. The UI (`SimulatorPanel` in `route.tsx`) lacks the input to select the number of images. The backend `merchantPreviewGenerate` function calls `generateImages` with `numImages: 1` explicitly.
- **AC 3.3 Not Implemented (Cost Estimation)**: The UI does not display the estimated cost (e.g., "$0.05 × N") *before* running the generation. The merchant has no visibility into cost until after generation, which violates the requirement "displays estimated cost ... clearly before running".

## 🟡 MEDIUM ISSUES
- **AC 3.4 Costs Logic**: The "Remove Background" cost calculation ($0.025) is not displayed in the pre-generation estimate in the UI.

## 🟢 LOW ISSUES
- Minor: `app/routes/app/api/preview/$jobId/route.ts` listed in story file is actually `.tsx`.
