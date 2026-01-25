# Story 6.2: Storefront input step (photo upload + text validation)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a buyer,
I want to upload a photo (and optionally enter text) as inputs to personalization,
so that the generated preview uses my content.

## Acceptance Criteria

1. **Given** the buyer is in the personalization stepper, **When** they reach the input step, **Then** the UI requires a photo upload to proceed. [Source: _bmad-output/planning-artifacts/epics.md#Story 6.2: Upload Photo + Optional Text Input (Validation)]
2. **Given** the buyer uploads an image file, **When** the file type is one of `jpeg`, `jpg`, `png`, `heic`, `avif`, `webp`, **Then** the upload is accepted and a preview of the uploaded image is shown (replacing the upload area). [Source: _bmad-output/planning-artifacts/epics.md#Story 6.2: Upload Photo + Optional Text Input (Validation)]
3. **Given** the template has optional text enabled (checked via `product.metafields.personalize_design.config` or mock config for MVP), **When** the buyer views the input step, **Then** a text input field is shown and can be left empty. [Source: _bmad-output/planning-artifacts/epics.md#Story 6.2: Upload Photo + Optional Text Input (Validation)]
4. **Given** the uploaded file is an unsupported type or upload fails, **When** the buyer attempts to proceed, **Then** the UI shows a clear error message and blocks progression. [Source: _bmad-output/planning-artifacts/epics.md#Story 6.2: Upload Photo + Optional Text Input (Validation)]
5. **UI/UX:** The upload area supports drag-and-drop and click-to-upload. It uses a premium-minimal aesthetic (shadcn styling). [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Interaction Patterns]
6. **State:** Valid inputs (file + text) are stored in the global Zustand store (`useStepperStore`). [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture]

## Tasks / Subtasks

- [x] Create `InputStep` component in `storefront/stepper/src/components/InputStep.tsx`
  - [x] Implement file upload area (click + drag-and-drop)
  - [x] Implement image preview state (show uploaded image with "Remove/Replace" button)
  - [x] Implement optional text input (conditional rendering based on config)
- [x] Update `useStepperStore` in `storefront/stepper/src/stepper-store.ts`
  - [x] Add `file: File | null` and `textInput: string` to state
  - [x] Add actions: `setFile`, `setTextInput`, `resetInputs`
- [x] Implement client-side validation logic
  - [x] Valid types: `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/avif`
  - [x] Max size validation (e.g., 10MB default)
- [x] Integrate `InputStep` into `PersonalizeStepper` (main shell)
  - [x] Show `InputStep` when current step is 0 (or 'input')
  - [x] Connect "Generate" button (primary CTA) to validate and proceed (next story will handle actual generation call)
- [x] Add shadcn `Input` and `Label` components (if missing)
- [x] Manual QA: Verify file acceptance, error states, and state persistence

## Dev Notes

- **State Management:** Use `stepper-store.ts` as the single source of truth. Do not keep local state for inputs unless it's transient UI state (like drag hover).
- **Validation:** Use a Zod schema for file validation if possible, or simple helper functions. The types `heic` and `avif` might need browser compatibility checks or simple acceptance (backend handles conversion? MVP says "upload is accepted"). For MVP, assume browser support or standard input acceptance.
- **Styling:** Use shadcn primitives. For the file upload area, a custom styled `div` wrapping a hidden `input type="file"` is standard.
- **Config:** The story mentions "optional text enabled". For now, you can hardcode a default or read `personalizationEnabled` from the store. If the config schema isn't fully defined in metafields yet, assume text is _disabled_ by default or check for a `textEnabled` flag in the config object if present.
- **No New Libraries:** Do not install `react-dropzone`. Implement simple native drag-and-drop handlers (`onDragOver`, `onDrop`).

### Developer Context

- **Previous Work:** `Trigger` and `Shell` are implemented. `PersonalizeStepper` opens the shell. Now we need the content _inside_ the shell.
- **Current Flow:** User clicks "Personalize" -> Shell opens -> User sees `InputStep`.
- **Future Context:** The "Generate" button on this step will trigger the API call in the _next_ story. For this story, just validate and store the state, maybe log "Ready to generate".

### Technical Requirements

- **File Types:** `['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/avif']`.
- **Max File Size:** 10MB (safe default).
- **Component Path:** `storefront/stepper/src/components/InputStep.tsx`.
- **Store Path:** `storefront/stepper/src/stepper-store.ts`.

### Architecture Compliance

- Storefront bundle only. No Polaris.
- Zustand for state.
- Tailwind for styling.

### Library / Framework Requirements

- `react`
- `zustand`
- `tailwindcss`
- `lucide-react` (for upload icons)

### File Structure Requirements

- `storefront/stepper/src/components/InputStep.tsx` (New)
- `storefront/stepper/src/components/ui/input.tsx` (Add if missing)
- `storefront/stepper/src/components/ui/label.tsx` (Add if missing)
- `storefront/stepper/src/stepper-store.ts` (Modify)

### Testing Requirements

- Unit test `stepper-store` updates (file/text setting).
- Manual test: Drag and drop a valid image, drag and drop an invalid file (PDF), check error messages.

### Project Structure Notes

- Keep all new logic in `storefront/stepper/src`.

### References

- \_bmad-output/planning-artifacts/epics.md#Story 6.2: Upload Photo + Optional Text Input (Validation)
- \_bmad-output/planning-artifacts/ux-design-specification.md#Interaction Patterns

## Dev Agent Record

### Agent Model Used

antigravity-gemini-3-pro

### Debug Log References

### Completion Notes List

- Implemented `InputStep` component with 2-column layout (Preview Left, Inputs Right) using shadcn primitives.
- Implemented `Input` and `Label` UI components.
- Updated `useStepperStore` to manage file and text input state.
- Added `textEnabled` flag to store config for conditional text input rendering.
- Added client-side validation for file type and size (Max 10MB).
- Integrated `InputStep` into `Shell` component, updating dialog width for desktop.
- Added "Generate" CTA that triggers `next()`.
- Added keyboard accessibility (tabIndex, Enter/Space key handlers) to file upload area.
- Added browser compatibility detection for HEIC/AVIF file types.
- Added unit tests for validation logic, browser support, and store state.
- Verified logic with tests.
- **Code Review Fixes Applied (2026-01-25):**
  - Fixed AC 3: Text input now conditionally renders based on `config.textEnabled`.
  - Added `textEnabled` field to StepperState config.
  - Added keyboard accessibility to upload area (WCAG 2.1 AA compliant).
  - Created browser-support utility to detect HEIC/AVIF compatibility.
  - Updated validation tests to cover all MIME types and browser compatibility.
  - Updated File List to include build artifact changes.

### File List

- storefront/stepper/src/components/InputStep.tsx
- storefront/stepper/src/components/ui/input.tsx
- storefront/stepper/src/components/ui/label.tsx
- storefront/stepper/src/components/Shell.tsx
- storefront/stepper/src/stepper-store.ts
- storefront/stepper/src/lib/validation.ts
- storefront/stepper/src/lib/validation.test.ts
- storefront/stepper/src/lib/browser-support.ts
- storefront/stepper/src/stepper-store.test.ts
- extensions/personalize-design-app/assets/personalize-stepper.css
- extensions/personalize-design-app/assets/personalize-stepper.js
