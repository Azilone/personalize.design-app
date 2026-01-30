/**
 * Asset resolution service for fulfillment workflows.
 *
 * Handles:
 * - Resolving personalization_id to stored preview assets
 * - Validating asset existence and accessibility
 * - Secure retrieval via signed URLs
 */

import {
  createSignedReadUrl,
  fileExists,
  GENERATED_DESIGNS_BUCKET,
  type SignedReadUrlResult,
} from "../supabase/storage";
import {
  getPreviewJobById,
  type PreviewJobRecord,
} from "../previews/preview-jobs.server";
import logger from "../../lib/logger";

/**
 * Error codes for asset resolution operations.
 */
export type AssetResolutionErrorCode =
  | "asset_not_found"
  | "asset_inaccessible"
  | "invalid_personalization_id"
  | "storage_error";

/**
 * Recovery guidance for asset resolution errors.
 * Maps error codes to human-readable recovery instructions.
 */
export const RECOVERY_GUIDANCE: Record<AssetResolutionErrorCode, string> = {
  asset_not_found:
    "The generated design file was not found. Check if the preview generation completed successfully in the storefront. If the preview was successful, this may indicate a storage issue. Regenerate the design in the storefront or contact support.",
  asset_inaccessible:
    "The design file exists but is not accessible. This may be a temporary storage issue. Retry the fulfillment process. If the issue persists, check the preview generation job status.",
  invalid_personalization_id:
    "The personalization ID is invalid or empty. Verify the order line contains the correct personalization_id metadata. This may indicate a data integrity issue.",
  storage_error:
    "A storage service error occurred while accessing the file. This is often temporary. Retry the fulfillment process. If the issue persists, check storage configuration and connectivity.",
};

/**
 * Asset resolution error.
 */
export class AssetResolutionError extends Error {
  readonly code: AssetResolutionErrorCode;
  readonly retryable: boolean;
  readonly shopId: string;
  readonly orderLineId: string;
  readonly personalizationId: string;

  constructor(
    code: AssetResolutionErrorCode,
    message: string,
    params: {
      shopId: string;
      orderLineId: string;
      personalizationId: string;
      retryable?: boolean;
    },
  ) {
    super(message);
    this.name = "AssetResolutionError";
    this.code = code;
    this.shopId = params.shopId;
    this.orderLineId = params.orderLineId;
    this.personalizationId = params.personalizationId;
    this.retryable = params.retryable ?? false;
  }
}

/**
 * Resolved asset information.
 */
export interface ResolvedAsset {
  /** Storage bucket name */
  bucket: string;
  /** Storage key/path */
  storageKey: string;
  /** Original design URL (for reference) */
  designUrl: string | null;
  /** Preview job ID */
  jobId: string;
  /** Template ID used for generation */
  templateId: string;
  /** Product ID */
  productId: string;
}

/**
 * Asset retrieval result with signed URL.
 */
export interface AssetRetrievalResult extends ResolvedAsset {
  /** Signed URL for secure access */
  signedUrl: string;
  /** URL expiry timestamp */
  expiresAt: Date;
}

/**
 * Resolve personalization_id to stored preview asset.
 *
 * @param shopId - Shop ID for multi-tenancy
 * @param orderLineId - Order line ID for context
 * @param personalizationId - The personalization ID (job_id from PreviewJob)
 * @returns Resolved asset information
 * @throws AssetResolutionError if asset cannot be resolved
 */
export async function resolveAssetByPersonalizationId(
  shopId: string,
  orderLineId: string,
  personalizationId: string,
): Promise<ResolvedAsset> {
  logger.info(
    {
      shop_id: shopId,
      order_line_id: orderLineId,
      personalization_id: personalizationId,
    },
    "Resolving asset by personalization_id",
  );

  // Validate personalization_id format
  if (!personalizationId || personalizationId.trim().length === 0) {
    throw new AssetResolutionError(
      "invalid_personalization_id",
      "Personalization ID is required",
      { shopId, orderLineId, personalizationId, retryable: false },
    );
  }

  // Look up the preview job by personalization_id (which is the job_id)
  const previewJob = await getPreviewJobById(shopId, personalizationId);

  if (!previewJob) {
    logger.warn(
      {
        shop_id: shopId,
        order_line_id: orderLineId,
        personalization_id: personalizationId,
      },
      "Preview job not found for personalization_id",
    );

    throw new AssetResolutionError(
      "asset_not_found",
      `No preview job found for personalization_id: ${personalizationId}`,
      { shopId, orderLineId, personalizationId, retryable: false },
    );
  }

  // Validate that the asset has been generated and stored
  if (!previewJob.designStorageKey) {
    logger.warn(
      {
        shop_id: shopId,
        order_line_id: orderLineId,
        personalization_id: personalizationId,
        job_id: previewJob.jobId,
        job_status: previewJob.status,
      },
      "Preview job exists but design storage key is missing",
    );

    throw new AssetResolutionError(
      "asset_not_found",
      `Preview job ${personalizationId} exists but design has not been stored`,
      { shopId, orderLineId, personalizationId, retryable: false },
    );
  }

  // Verify the file actually exists in storage
  const exists = await fileExists(
    previewJob.designStorageKey,
    GENERATED_DESIGNS_BUCKET,
  );
  if (!exists) {
    logger.error(
      {
        shop_id: shopId,
        order_line_id: orderLineId,
        personalization_id: personalizationId,
        job_id: previewJob.jobId,
        storage_key: previewJob.designStorageKey,
        bucket: GENERATED_DESIGNS_BUCKET,
      },
      "Design file not found in storage",
    );

    throw new AssetResolutionError(
      "asset_not_found",
      `Design file not found in storage: ${previewJob.designStorageKey}`,
      { shopId, orderLineId, personalizationId, retryable: false },
    );
  }

  // Validate job status - must be done or mockups_failed (design still exists)
  const validStatuses = ["done", "mockups_failed"];
  if (!validStatuses.includes(previewJob.status)) {
    logger.warn(
      {
        shop_id: shopId,
        order_line_id: orderLineId,
        personalization_id: personalizationId,
        job_id: previewJob.jobId,
        job_status: previewJob.status,
      },
      "Preview job is not in a valid state for fulfillment",
    );

    throw new AssetResolutionError(
      "asset_inaccessible",
      `Preview job ${personalizationId} is in status '${previewJob.status}', expected 'done' or 'mockups_failed'`,
      { shopId, orderLineId, personalizationId, retryable: false },
    );
  }

  logger.info(
    {
      shop_id: shopId,
      order_line_id: orderLineId,
      personalization_id: personalizationId,
      job_id: previewJob.jobId,
      storage_key: previewJob.designStorageKey,
    },
    "Asset resolved successfully",
  );

  return {
    bucket: GENERATED_DESIGNS_BUCKET,
    storageKey: previewJob.designStorageKey,
    designUrl: previewJob.designUrl,
    jobId: previewJob.jobId,
    templateId: previewJob.templateId,
    productId: previewJob.productId,
  };
}

/**
 * Generate a signed URL for secure asset retrieval.
 *
 * @param asset - Resolved asset information
 * @returns Asset retrieval result with signed URL
 * @throws AssetResolutionError if signed URL cannot be generated
 */
export async function generateAssetSignedUrl(
  asset: ResolvedAsset,
): Promise<AssetRetrievalResult> {
  logger.info(
    {
      shop_id: asset.jobId,
      storage_key: asset.storageKey,
      bucket: asset.bucket,
    },
    "Generating signed URL for asset retrieval",
  );

  try {
    const signedUrlResult: SignedReadUrlResult = await createSignedReadUrl(
      asset.storageKey,
      asset.bucket,
    );

    logger.info(
      {
        shop_id: asset.jobId,
        storage_key: asset.storageKey,
        expires_at: signedUrlResult.expiresAt.toISOString(),
      },
      "Signed URL generated successfully",
    );

    return {
      ...asset,
      signedUrl: signedUrlResult.readUrl,
      expiresAt: signedUrlResult.expiresAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    logger.error(
      {
        shop_id: asset.jobId,
        storage_key: asset.storageKey,
        error: message,
      },
      "Failed to generate signed URL for asset",
    );

    throw new AssetResolutionError(
      "storage_error",
      `Failed to generate signed URL: ${message}`,
      {
        shopId: asset.jobId,
        orderLineId: asset.jobId,
        personalizationId: asset.jobId,
        retryable: true,
      },
    );
  }
}

/**
 * Retrieve asset with signed URL for operators/merchants.
 *
 * @param shopId - Shop ID for multi-tenancy
 * @param orderLineId - Order line ID for context
 * @param personalizationId - The personalization ID
 * @returns Asset retrieval result with signed URL
 * @throws AssetResolutionError if asset cannot be resolved or accessed
 */
export async function retrieveAssetForFulfillment(
  shopId: string,
  orderLineId: string,
  personalizationId: string,
): Promise<AssetRetrievalResult> {
  // Resolve the asset
  const resolvedAsset = await resolveAssetByPersonalizationId(
    shopId,
    orderLineId,
    personalizationId,
  );

  // Generate signed URL for secure access
  return generateAssetSignedUrl(resolvedAsset);
}
