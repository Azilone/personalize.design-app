# Preview Services Refactoring Plan

## Executive Summary

Refactor duplicate preview generation workflows into a unified, maintainable architecture with reusable core services.

**Status:** 🟡 Planning (Not implemented)
**Last Updated:** 2026-01-29
**Author:** AI Agent

---

## Current State

### Problems Identified

1. **Code Duplication** (~90% duplicate logic):
   - 4 workflow files: `buyer-preview-generation.server.ts`, `merchant-preview-generation.server.ts`, `generation.server.ts`
   - All implement: template loading, billing guardrails, fal.ai generation, Printify mockups, storage upload

2. **Separate Database Models**:
   - `BuyerPreviewJob` table (lines 224-242 in schema.prisma)
   - `MerchantPreview` table (lines 201-222 in schema.prisma)
   - Overlapping fields: `shop_id`, `product_id`, `template_id`, `status`, `error_message`

3. **Inconsistent Identifiers**:
   - Buyer uses: `id` + `buyer_session_id`
   - Merchant uses: `id` + `job_id`

4. **Status Enum Mismatch**:
   - Buyer: `pending`, `processing`, `succeeded`, `failed` (4 statuses)
   - Merchant: `queued`, `generating`, `creating_mockups`, `done`, `failed` (5 statuses)

5. **Output Structure Differences**:
   - Buyer: `preview_storage_key`, `preview_url` (single image)
   - Merchant: `design_url`, `mockup_urls[]` (design + multiple mockups)

6. **Missing Future Capability**:
   - Buyers can't get mockups on products (t-shirt, mug, etc.)
   - Planned feature for "personalization hub" but no data model support

### Files Currently Using Preview Services

| File                                                                    | Usage                    |
| ----------------------------------------------------------------------- | ------------------------ |
| `/app/services/buyer-previews/buyer-previews.server.ts`                 | Buyer preview CRUD       |
| `/app/services/merchant-previews/merchant-previews.server.ts`           | Merchant preview CRUD    |
| `/app/services/merchant-previews/merchant-previews.server.test.ts`      | Merchant tests           |
| `/app/services/inngest/types.ts`                                        | Schema definitions       |
| `/app/services/inngest/types.test.ts`                                   | Schema tests             |
| `/app/routes/app-proxy/generate-preview/route.tsx`                      | Buyer create endpoint    |
| `/app/routes/app-proxy/generate-preview-status/route.tsx`               | Buyer status endpoint    |
| `/app/routes/app/products/$productId/route.tsx`                         | Merchant create endpoint |
| `/app/routes/app/api/preview/$jobId/route.ts`                           | Merchant status endpoint |
| `/app/services/inngest/functions/buyer-preview-generation.server.ts`    | Buyer workflow           |
| `/app/services/inngest/functions/merchant-preview-generation.server.ts` | Merchant workflow        |
| `/app/services/inngest/functions/generation.server.ts`                  | Unified workflow         |
| `/prisma/schema.prisma`                                                 | DB models                |

---

## Target Architecture

### Design Principles

1. **Single Responsibility**: Each service does one thing well
2. **DRY**: Core logic (image generation, mockups, billing) implemented once
3. **Billing at Workflow Level**: Maximum visibility and control
4. **Unified Identifiers**: `job_id` for all preview types
5. **Flexible Outputs**: Support design-only or design + mockups
6. **Future-Ready**: Easy to add mockups for buyers later
7. **Separate Fake Generation**: Dev-mode testing with placeholder URLs (fake wait + `https://placehold.co/600x400?text=Hello+World`)

### New Database Schema

```prisma
model PreviewJob {
  id                      String           @id @default(cuid())
  job_id                  String
  shop_id                 String
  product_id              String
  template_id             String
  type                    PreviewJobType

  // Input configuration
  input_image_url         String?
  input_text              String?
  variable_values         Json?
  cover_print_area        Boolean          @default(false)

  // Output (design)
  design_url              String?
  design_storage_key      String?

  // Output (mockups)
  mockup_urls             Json?
  temp_printify_product_id String?

  // Tracking
  session_id              String?          // Optional: for buyer sessions

  // Status and errors
  status                  PreviewJobStatus @default(queued)
  error_message           String?

  // Timestamps
  created_at              DateTime         @default(now())
  updated_at              DateTime         @updatedAt

  @@unique([shop_id, job_id])
  @@index([shop_id])
  @@index([job_id])
  @@index([type])
  @@map("preview_jobs")
}

enum PreviewJobType {
  buyer
  merchant
  template_test
}

enum PreviewJobStatus {
  queued
  generating
  processing
  creating_mockups
  done
  failed
}
```

**Key changes from old schema:**

- ✅ Single table for all preview types (`preview_jobs`)
- ✅ Unified identifier: `job_id` (will be `buyer_session_id` for buyer jobs)
- ✅ Unified status enum covering all use cases
- ✅ Flexible output: `design_url` + optional `mockup_urls[]`
- ✅ Input standardization: `input_image_url`, `input_text`, `variable_values`, `cover_print_area`
- ✅ Session tracking optional: `session_id` for buyer flow

---

## New Core Services

### 1. Image Generation Service

**File:** `/app/services/previews/image-generation.server.ts`

```typescript
/**
 * Core image generation service
 *
 * Responsibilities:
 * - Call fal.ai generateImages API
 * - Upload result to Supabase Storage
 * - Return design URL and storage key
 *
 * Billing: Handled at workflow level (NOT in this service)
 */

interface GenerateImageParams {
  imageUrl: string;
  prompt: string;
  modelId?: string;
  removeBackground?: boolean;
  imageSize: { width: number; height: number };
  shopId: string;
}

interface GenerateImageResult {
  designUrl: string;
  storageKey: string;
  readUrl: string;
  costUsd: number;
}

export const generateImage = async (
  params: GenerateImageParams,
): Promise<GenerateImageResult>;
```

### 2. Mockup Generation Service

**File:** `/app/services/previews/mockup-generation.server.ts`

```typescript
/**
 * Mockup generation service for Printify products
 *
 * Responsibilities:
 * - Create temporary Printify product
 * - Generate mockups with design applied
 * - Return mockup URLs and temp product ID for cleanup
 *
 * Billing: Free (Printify temp products don't incur charges)
 */

interface GenerateMockupsParams {
  designUrl: string;
  blueprintId: string;
  printProviderId: string;
  variantIds: number[];
  printArea: {
    position?: string;
    scale?: number;
    width: number;
    height: number;
  };
  shopId: string;
}

interface GenerateMockupsResult {
  mockupUrls: string[];
  tempProductId: string;
}

export const generateMockups = async (
  params: GenerateMockupsParams,
): Promise<GenerateMockupsResult>;
```

### 3. Preview Jobs Service

**File:** `/app/services/previews/preview-jobs.server.ts`

```typescript
/**
 * Preview job CRUD operations
 *
 * Responsibilities:
 * - Create preview jobs
 * - Update job status and outputs
 * - Query jobs by shop_id + job_id
 * - Type mapping (snake_case ↔ camelCase)
 * - Field normalization
 */

interface CreatePreviewJobParams {
  jobId: string;
  shopId: string;
  productId: string;
  templateId: string;
  type: 'buyer' | 'merchant' | 'template_test';
  sessionId?: string;
  inputImageUrl?: string;
  inputText?: string;
  variableValues?: Record<string, string>;
  coverPrintArea?: boolean;
}

interface UpdatePreviewJobParams {
  jobId: string;
  shopId: string;
  status: PreviewJobStatus;
  designUrl?: string | null;
  designStorageKey?: string | null;
  mockupUrls?: string[] | null;
  tempPrintifyProductId?: string | null;
  errorMessage?: string | null;
}

interface PreviewJobRecord {
  id: string;
  jobId: string;
  shopId: string;
  productId: string;
  templateId: string;
  type: PreviewJobType;
  inputImageUrl: string | null;
  inputText: string | null;
  variableValues: Record<string, string>;
  coverPrintArea: boolean;
  designUrl: string | null;
  designStorageKey: string | null;
  mockupUrls: string[];
  tempPrintifyProductId: string | null;
  sessionId: string | null;
  status: PreviewJobStatus;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const createPreviewJob = async (
  params: CreatePreviewJobParams,
): Promise<PreviewJobRecord>;

export const updatePreviewJob = async (
  params: UpdatePreviewJobParams,
): Promise<PreviewJobRecord | null>;

export const getPreviewJobById = async (
  shopId: string,
  jobId: string,
): Promise<PreviewJobRecord | null>;
```

---

## Updated Inngest Workflows

### 1. Real Preview Generation Workflow

**File:** `/app/services/inngest/functions/preview-generate.server.ts`

```typescript
/**
 * Real preview generation workflow (production mode)
 *
 * Handles: buyer previews, merchant previews, template tests
 *
 * Flow:
 * 1. Validate payload
 * 2. Load template
 * 3. Load product & Printify details
 * 4. Calculate image size
 * 5. Build prompt
 * 6. Check billing guardrails
 * 7. Create billable event (pending)
 * 8. Mark job: generating
 * 9. Generate image (fal.ai)
 * 10. Upload to Supabase
 * 11. Confirm billable event & charge
 * 12. Mark job: processing, design_url=...
 * 13. IF type !== 'buyer': generate mockups
 * 14. Mark job: done, mockup_urls=...
 * 15. Return result
 */

export const previewGenerate = inngest.createFunction(
  {
    id: "preview_generate",
    concurrency: {
      key: "event.data.shop_id",
      limit: 2,
    },
  },
  { event: "previews.generate.requested" },
  async ({ event, step }) => {
    // Implementation details in code
  },
);

export const previewGenerateFailure = inngest.createFunction(
  { id: "preview_generate_failure" },
  { event: "inngest/function.failed" },
  async ({ event, step }) => {
    //1. Fail billable event if needed
    //2. Update job: status=failed
    //3. Cleanup temp product if exists
  },
);
```

**Billing placement:** Workflow level (inside `previewGenerate`)

- Step 6: Check billing guardrails
- Step 7: Create billable event (pending)
- Step 11: Confirm and charge (after asset generated)
- Failure handler: Fail billable event (waive if cost incurred)

### 2. Fake Preview Generation Workflow (Dev Mode)

**File:** `/app/services/inngest/functions/preview-generate.server.ts`

```typescript
/**
 * Fake preview generation workflow (development mode)
 *
 * Purpose: Enable local testing without calling fal.ai or incurring costs
 *
 * Behavior:
 * - Simulates generation delay (5 seconds)
 * - Returns placeholder URL: `https://placehold.co/600x400?text=Hello+World`
 * - Updates job status through fake lifecycle: generating → creating_mockups → done
 * - No billing events created
 * - No actual images generated or stored
 */

export const previewFakeGenerate = inngest.createFunction(
  {
    id: "preview_fake_generate",
    concurrency: {
      key: "event.data.shop_id",
      limit: 2,
    },
  },
  { event: "previews.fake_generate.requested" },
  async ({ event, step }) => {
    // 1. Validate payload
    // 2. Load template (for input size calculation)
    // 3. Load product & Printify details (for mockup generation)
    // 4. Calculate image dimensions
    // 5. Mark job: generating
    // 6. Fake delay (5 seconds)
    // 7. Build placeholder URL with dimensions
    // 8. Mark job: processing, design_url=placeholder
    // 9. IF type !== 'buyer': generate mockups (with Printify temp product)
    // 10. Mark job: done, mockup_urls=...
    // 11. Return result
  },
);

export const previewFakeGenerateFailure = inngest.createFunction(
  { id: "preview_fake_generate_failure" },
  { event: "inngest/function.failed" },
  async ({ event, step }) => {
    // 1. Update job: status=failed
    // 2. Cleanup temp product if exists
  },
);

export const inngestFunctions = [
  previewGenerate,
  previewGenerateFailure,
  previewFakeGenerate,
  previewFakeGenerateFailure,
];
```

**Fake generation details:**

- **Placeholder URL format**: `https://placehold.co/{width}x{height}?text=Hello+World`
- **Fake delay**: 5 seconds to simulate real generation time
- **No billing**: Skips billing guardrails and billable event creation
- **Mockups**: Still creates Printify temp product for merchant previews (no charge)
- **Use case**: Local development, UI testing, CI/CD pipelines

---

## Type Schemas

### Updated Inngest Event Schemas

**File:** `/app/services/inngest/types.ts`

```typescript
/**
 * Real preview generation payload (production mode)
 */

export const previewGeneratePayloadSchema = z.object({
  // Core identifiers
  job_id: z.string().min(1),
  shop_id: z.string().min(1),
  product_id: z.string().min(1),
  template_id: z.string().min(1),
  type: z.enum(["buyer", "merchant", "template_test"]),

  // Buyer inputs
  image_url: z.string().url().optional(),

  // Merchant/template_test inputs
  test_image_url: z.string().url().optional(),
  test_text: z.string().optional(),
  variable_values: z.record(z.string(), z.string()).optional(),
  cover_print_area: z.boolean().optional(),

  // Optional
  session_id: z.string().optional(),
});

/**
 * Fake preview generation payload (development mode)
 */

export const previewFakeGeneratePayloadSchema = z.object({
  // Core identifiers
  job_id: z.string().min(1),
  shop_id: z.string().min(1),
  product_id: z.string().min(1),
  template_id: z.string().min(1),
  type: z.enum(["buyer", "merchant", "template_test"]),

  // Buyer inputs (optional for fake generation)
  image_url: z.string().url().optional(),

  // Merchant/template_test inputs (optional for fake generation)
  test_image_url: z.string().url().optional(),
  test_text: z.string().optional(),
  variable_values: z.record(z.string(), z.string()).optional(),
  cover_print_area: z.boolean().optional(),

  // Optional
  session_id: z.string().optional(),
});

export type PreviewGeneratePayload = z.infer<
  typeof previewGeneratePayloadSchema
>;
export type PreviewFakeGeneratePayload = z.infer<
  typeof previewFakeGeneratePayloadSchema
>;
```

**Event Names:**

- `previews.generate.requested` → Triggers `previewGenerate` workflow (real fal.ai generation)
- `previews.fake_generate.requested` → Triggers `previewFakeGenerate` workflow (dev mode with placeholder)

---

## API Routes (Backward Compatibility)

### Buyer Routes

**File:** `/app/routes/app-proxy/generate-preview/route.tsx`

```typescript
/**
 * Buyer preview generation endpoint (app proxy)
 *
 * Changes:
 * - Create PreviewJob with type='buyer'
 * - Use buyer_session_id as job_id
 * - Send "previews.generate.requested" event
 * - Map image_url → input_image_url
 */

// Old: createBuyerPreviewJob({ jobId: buyerSessionId, ... })
// New: createPreviewJob({ jobId: buyerSessionId, type: 'buyer', ... })
```

**File:** `/app/routes/app-proxy/generate-preview-status/route.tsx`

```typescript
/**
 * Buyer preview status endpoint (app proxy)
 *
 * Changes:
 * - Query PreviewJob by buyer_session_id (as job_id)
 * - Return unified format (design_url + mockup_urls if available)
 */

// Old: getBuyerPreviewJobById(shopId, buyerSessionId)
// New: getPreviewJobById(shopId, buyerSessionId)
```

### Merchant Routes

**File:** `/app/routes/app/products/$productId/route.tsx`

```typescript
/**
 * Merchant preview generation endpoint (admin)
 *
 * Changes:
 * - Create PreviewJob with type='merchant'
 * - Use job_id
 * - Send "previews.generate.requested" event
 * - Map test_image_url → input_image_url
 */

// Old: createMerchantPreview({ jobId, ... })
// New: createPreviewJob({ jobId, type: 'merchant', ... })
```

**File:** `/app/routes/app/api/preview/$jobId/route.ts`

```typescript
/**
 * Merchant preview status endpoint (admin)
 *
 * Changes:
 * - Query PreviewJob by job_id
 * - Return unified format
 */

// Old: getMerchantPreviewByJobId(shopId, jobId)
// New: getPreviewJobById(shopId, jobId)
```

---

## File Changes Summary

### Files to Delete

```
/app/services/buyer-previews/
  ├── buyer-previews.server.ts

/app/services/merchant-previews/
  ├── merchant-previews.server.ts
  └── merchant-previews.server.test.ts

/app/services/inngest/functions/
  ├── buyer-preview-generation.server.ts
  ├── merchant-preview-generation.server.ts
  └── generation.server.ts
```

### Files to Create

```
/app/services/previews/
  ├── image-generation.server.ts
  ├── mockup-generation.server.ts
  └── preview-jobs.server.ts

/app/services/inngest/functions/
  └── preview-generate.server.ts (contains both previewGenerate + previewFakeGenerate)
```

### Files to Refactor

```
/prisma/schema.prisma
  - Remove: BuyerPreviewJob model
  - Remove: MerchantPreview model
  - Remove: BuyerPreviewStatus enum
  - Remove: MerchantPreviewStatus enum
  - Add: PreviewJob model
  - Add: PreviewJobType enum
  - Add: PreviewJobStatus enum

/app/services/inngest/types.ts
  - Update: Add unified schemas
  - Keep: templateTestGeneratePayloadSchema
  - Remove: buyerPreviewGeneratePayloadSchema
  - Remove: merchantPreviewGeneratePayloadSchema
  - Remove: buyerPreviewGeneratePayloadSchema
  - Remove: merchantPreviewFakeGeneratePayloadSchema

/app/routes/app-proxy/generate-preview/route.tsx
  - Update: Use createPreviewJob
  - Update: Use previewGeneratePayloadSchema

/app/routes/app-proxy/generate-preview-status/route.tsx
  - Update: Use getPreviewJobById
  - Update: Return unified format

/app/routes/app/products/$productId/route.tsx
  - Update: Use createPreviewJob
  - Update: Use previewGeneratePayloadSchema

/app/routes/app/api/preview/$jobId/route.ts
  - Update: Use getPreviewJobById
  - Update: Return unified format
```

---

## Migration Steps

### Phase 1: Database Schema

1. ✅ Update `prisma/schema.prisma` with new `PreviewJob` model
2. ✅ Remove old `BuyerPreviewJob` and `MerchantPreview` models
3. ✅ Run `npx prisma migrate dev --name unified_preview_jobs`
4. ✅ Regenerate Prisma client: `npx prisma generate`

### Phase 2: Core Services

1. ✅ Create `/app/services/previews/image-generation.server.ts`
2. ✅ Create `/app/services/previews/mockup-generation.server.ts`
3. ✅ Create `/app/services/previews/preview-jobs.server.ts`
4. ✅ Test core services in isolation

### Phase 3: Workflow

1. ✅ Create `/app/services/inngest/functions/preview-generate.server.ts` (contains 2 workflows)
   - `previewGenerate`: Real fal.ai generation with billing
   - `previewFakeGenerate`: Fake generation with placeholder URLs (5s delay)
2. ✅ Update `/app/services/inngest/types.ts` with unified schemas
3. ✅ Test fake generation workflow first (dev mode, no cost)
4. ✅ Test real generation workflow (optional, requires fal.ai credits)

### Phase 4: Buyer Routes

1. ✅ Refactor `/app/routes/app-proxy/generate-preview/route.tsx`
2. ✅ Refactor `/app/routes/app-proxy/generate-preview-status/route.tsx`
3. ✅ Test buyer flow end-to-end

### Phase 5: Merchant Routes

1. ✅ Refactor `/app/routes/app/products/$productId/route.tsx`
2. ✅ Refactor `/app/routes/app/api/preview/$jobId/route.ts`
3. ✅ Test merchant flow end-to-end

### Phase 6: Cleanup

1. ✅ Delete old workflow files
2. ✅ Delete old service files
3. ✅ Run tests and verify everything works
4. ✅ Update AGENTS.md if needed

---

## Expected Benefits

### Code Reduction

| Metric               | Before | After | Improvement            |
| -------------------- | ------ | ----- | ---------------------- |
| Workflow files       | 4      | 1     | -75%                   |
| Service files        | 2      | 3     | +1 (better separation) |
| DB tables            | 2      | 1     | -50%                   |
| Status enums         | 2      | 1     | -50%                   |
| Duplicate code lines | ~800   | ~200  | -75%                   |

### Maintainability

- ✅ **Single source of truth**: One place to update billing, generation, mockup logic
- ✅ **Easier testing**: Core services can be unit tested in isolation
- ✅ **Clear responsibilities**: Each service has one job
- ✅ **Consistent patterns**: Same approach for all preview types

### Future Readiness

- ✅ **Buyer mockups**: Easy to add by setting `mockup_urls` on buyer jobs
- ✅ **New preview types**: Add to `PreviewJobType` enum, no core logic changes
- ✅ **Flexible billing**: Workflow-level billing allows for complex scenarios
- ✅ **Scalable architecture**: Clean separation allows for future features

---

## Risk Mitigation

### Potential Issues

1. **Breaking existing API contracts**:
   - **Mitigation**: Maintain backward compatibility in route responses
   - Return both old and new fields during transition

2. **Data loss if migration fails**:
   - **Mitigation**: You said we can reset DB, so minimal risk
   - For production, would need a proper migration script

3. **Workflow bugs affecting both buyer and merchant**:
   - **Mitigation**: Thorough testing of both flows before deployment
   - Start with fake generation, then test real generation

4. **Billing errors in unified workflow**:
   - **Mitigation**: Billing guardrails and failure handler tested thoroughly
   - Waive charges on failure to protect merchants

5. **Fake vs real generation confusion**:
   - **Mitigation**: Separate event names clearly distinguish behavior
   - `previews.fake_generate.requested` → placeholder URLs, no billing
   - `previews.generate.requested` → real fal.ai generation, billing applied
   - Document in code comments and AGENTS.md

---

## Testing Strategy

### Unit Tests

1. **image-generation.server.ts**:
   - Test successful generation
   - Test Supabase upload
   - Test error handling

2. **mockup-generation.server.ts**:
   - Test temp product creation
   - Test mockup generation
   - Test cleanup

3. **preview-jobs.server.ts**:
   - Test CRUD operations
   - Test type mapping
   - Test field normalization

### Integration Tests

1. **Buyer flow** (fake generation):
   - Create job → Generate → Update → Check status
   - Verify `design_url` is placeholder URL
   - Verify 5-second delay works
   - Verify no billing events created

2. **Merchant flow** (fake generation):
   - Create job → Generate → Mockups → Update → Check status
   - Verify `design_url` is placeholder URL
   - Verify `mockup_urls[]` contains Printify mockup URLs
   - Verify temp product is created and cleaned up

3. **Real generation flow** (optional, requires fal.ai credits):
   - Test successful generation with actual fal.ai call
   - Test billing flow (guardrails → pending event → confirmed charge)
   - Test failed generation and charge waiver

4. **Billing flow**:
   - Test successful charge
   - Test failed charge (waive if cost incurred)

### Manual Tests

1. **Buyer storefront**:
   - Upload photo
   - Submit for preview
   - Poll for status
   - Verify preview image loads

2. **Merchant admin**:
   - Select template
   - Configure test inputs
   - Generate preview
   - Verify design and mockups load

---

## Rollback Plan

If the refactoring causes issues:

1. **Quick rollback**: Revert to git commit before refactoring
2. **Partial rollback**: Keep new schema but restore old services/workflows
3. **Fallback**: Disable new workflow, re-enable old ones temporarily

**Note**: Since you can reset the DB, rollback is straightforward.

---

## Open Questions (Resolved)

| Question                     | Answer                                                                                  | Decision              |
| ---------------------------- | --------------------------------------------------------------------------------------- | --------------------- |
| Session tracking for buyers? | Use `job_id` (will be `buyer_session_id`)                                               | ✅ Unified identifier |
| Fake generation?             | Keep separate events (`preview.generate.requested` + `preview.fake_generate.requested`) | ✅ Separate           |
| Billing placement?           | Workflow level for visibility and control                                               | ✅ Workflow level     |
| DB migration?                | Full migration script (drop old tables, create new one)                                 | ✅ Proper migration   |
| Buyer mockups?               | Support in schema (optional), implement later                                           | ✅ Future-ready       |

---

## Architectural Decisions

### Why Separate Fake Generation Workflow?

**Decision:** Keep `previews.fake_generate.requested` as a separate event/workflow from `previews.generate.requested`

**Rationale:**

1. **Clear Intent**: Event names immediately communicate behavior without inspecting flags
   - `previews.fake_generate.requested` → Developer mode, no cost, placeholder URLs
   - `previews.generate.requested` → Production mode, billing applied, real generation

2. **Simpler Testing**: Can test UI and workflows without:
   - Real fal.ai API calls
   - Billing logic complexity
   - Actual image generation and storage

3. **Fail-Fast Development**: Placeholder URL format provides immediate visual feedback
   - `https://placehold.co/600x400?text=Hello+World`
   - 5-second delay simulates real generation time
   - Merchant flows still generate real Printify mockups for product context

4. **Reduced Cognitive Load**: No conditional logic to check `fake_generation` flag throughout workflow
   - Separate workflows have clear, single-purpose code paths
   - Easier to reason about and maintain

5. **Cost Control**: Impossible to accidentally trigger real generation in dev environment
   - Separate events require explicit routing decision in calling code
   - No risk of billing during local development or CI/CD

**Trade-offs:**

- **Pro**: Simpler workflows, clearer intent, better developer experience
- **Con**: Two workflows instead of one (still fewer than original 4)

**Architect Verdict**: This is pragmatic. Separate workflows for different execution modes is boring technology that works.

---

## Implementation Checklist

- [ ] Phase 1: Update Prisma schema
  - [ ] Add `PreviewJob` model
  - [ ] Add `PreviewJobType` enum
  - [ ] Add `PreviewJobStatus` enum
  - [ ] Remove old models and enums
  - [ ] Run migration
  - [ ] Generate Prisma client

- [ ] Phase 2: Create core services
  - [ ] `image-generation.server.ts`
  - [ ] `mockup-generation.server.ts`
  - [ ] `preview-jobs.server.ts`

- [ ] Phase 3: Create workflow
  - [ ] `preview-generate.server.ts` (4 functions: previewGenerate, previewGenerateFailure, previewFakeGenerate, previewFakeGenerateFailure)
  - [ ] Update `types.ts` schemas
  - [ ] Test fake generation workflow (no cost)
  - [ ] Test real generation workflow (optional, requires credits)

- [ ] Phase 4: Refactor buyer routes
  - [ ] `generate-preview/route.tsx`
  - [ ] `generate-preview-status/route.tsx`
  - [ ] Test buyer flow

- [ ] Phase 5: Refactor merchant routes
  - [ ] `$productId/route.tsx`
  - [ ] `api/preview/$jobId/route.ts`
  - [ ] Test merchant flow

- [ ] Phase 6: Cleanup
  - [ ] Delete old workflow files
  - [ ] Delete old service files
  - [ ] Run all tests
  - [ ] Verify end-to-end

- [ ] Documentation
  - [ ] Update AGENTS.md if needed
  - [ ] Add inline code comments

---

## Success Criteria

- [ ] Buyer preview generation works (end-to-end)
- [ ] Merchant preview generation works (end-to-end)
- [ ] Template test generation still works
- [ ] Billing is reliable (no double charges)
- [ ] Code reduction >70%
- [ ] All tests pass
- [ ] No console errors or warnings
- [ ] Performance is similar or better

---

## Notes
- do not forget to modify file when those workflow are used
- This is a **major refactoring** - test thoroughly before merging
- Consider running in staging/feature flag before full rollout
- Monitor logs closely after deployment
- Keep this document updated during implementation

---

**Document Status:** ✅ Planning Complete, Architect Reviewed, Ready for Implementation
**Next Step:** Begin Phase 1 (Database Schema)
**Architecture Note:** Separate fake generation workflow retained per developer preference (fake wait + placeholder URLs)
