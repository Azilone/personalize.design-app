/**
 * Supabase Storage service for file uploads.
 *
 * Handles:
 * - Signed URL generation for uploads
 * - Signed URL generation for reads
 * - File type validation
 *
 * Note: Currently mocked for development without full Supabase setup.
 * When Supabase is fully configured, replace mock implementations
 * with actual Supabase Storage client calls.
 */

/**
 * Allowed file types for test photo uploads.
 */
export const ALLOWED_FILE_TYPES = [
  "jpeg",
  "jpg",
  "png",
  "heic",
  "avif",
  "webp",
] as const;

/**
 * Maximum file size for uploads (10MB).
 */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Bucket name for test uploads.
 */
export const TEST_UPLOADS_BUCKET = "test-uploads";

/**
 * Signed URL expiry time in seconds (30 minutes).
 */
export const SIGNED_URL_EXPIRY_SECONDS = 30 * 60;

/**
 * File metadata for uploaded files.
 */
export interface FileMetadata {
  /** Original filename */
  originalName: string;
  /** File extension (e.g., "jpg", "png") */
  extension: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  sizeBytes: number;
}

/**
 * Upload result with signed URLs.
 */
export interface UploadResult {
  /** Unique key in storage bucket */
  storageKey: string;
  /** Signed URL for uploading the file (PUT) */
  uploadUrl: string;
  /** Signed URL for reading the file (GET) */
  readUrl: string;
  /** Expiry timestamp for signed URLs */
  expiresAt: Date;
}

/**
 * Error codes for storage operations.
 */
export type StorageErrorCode =
  | "invalid_file_type"
  | "file_too_large"
  | "storage_error"
  | "unknown";

/**
 * Storage-specific error.
 */
export class StorageError extends Error {
  readonly code: StorageErrorCode;
  readonly retryable: boolean;

  constructor(code: StorageErrorCode, message: string, retryable = true) {
    super(message);
    this.name = "StorageError";
    this.code = code;
    this.retryable = retryable;
  }
}

/**
 * Extract file extension from filename.
 *
 * @param filename - The filename to parse
 * @returns Lowercase extension without dot (e.g., "jpg")
 */
export function getFileExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf(".");
  if (lastDotIndex === -1 || lastDotIndex === filename.length - 1) {
    throw new StorageError(
      "invalid_file_type",
      "File must have an extension",
      false,
    );
  }
  return filename.slice(lastDotIndex + 1).toLowerCase();
}

/**
 * Validate file type is allowed.
 *
 * @param extension - File extension (e.g., "jpg")
 * @throws StorageError if file type is not allowed
 */
export function validateFileType(extension: string): void {
  if (!ALLOWED_FILE_TYPES.includes(extension as any)) {
    throw new StorageError(
      "invalid_file_type",
      `File type .${extension} is not allowed. Allowed types: ${ALLOWED_FILE_TYPES.join(
        ", ",
      )}`,
      false,
    );
  }
}

/**
 * Validate file size.
 *
 * @param sizeBytes - File size in bytes
 * @throws StorageError if file is too large
 */
export function validateFileSize(sizeBytes: number): void {
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    const maxSizeMB = (MAX_FILE_SIZE_BYTES / 1024 / 1024).toFixed(0);
    throw new StorageError(
      "file_too_large",
      `File is too large. Maximum size is ${maxSizeMB}MB`,
      false,
    );
  }
}

/**
 * Generate a unique storage key for an uploaded file.
 *
 * @param shopId - Shop ID for multi-tenancy
 * @param extension - File extension
 * @returns Unique storage key (e.g., "shops/shop-123/test-20260115-abc123.jpg")
 */
export function generateStorageKey(shopId: string, extension: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  // Random string: skip "0." prefix, take 6 chars
  const randomSuffix =
    Math.random().toString(36).split(".")[1]?.slice(0, 7) ||
    Math.random().toString(36).slice(2, 9);
  return `test/${shopId}/${timestamp}-${randomSuffix}.${extension}`;
}

/**
 * Generate signed URLs for uploading and reading a file.
 *
 * MOCKED VERSION: Returns placeholder URLs for development.
 * When Supabase is configured, replace with actual Supabase client calls.
 *
 * @param shopId - Shop ID for multi-tenancy
 * @param originalFilename - Original filename
 * @param sizeBytes - File size in bytes
 * @returns UploadResult with signed URLs
 * @throws StorageError on validation or storage errors
 */
export async function generateSignedUrls(
  shopId: string,
  originalFilename: string,
  sizeBytes: number,
): Promise<UploadResult> {
  // Validate file
  const extension = getFileExtension(originalFilename);
  validateFileType(extension);
  validateFileSize(sizeBytes);

  const storageKey = generateStorageKey(shopId, extension);
  const expiresAt = new Date(Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000);

  // MOCK: Return placeholder URLs
  // TODO: Replace with actual Supabase Storage signed URL generation
  // Example with Supabase:
  // const { data, error } = await supabase.storage
  //   .from(TEST_UPLOADS_BUCKET)
  //   .createSignedUploadUrl(storageKey, SIGNED_URL_EXPIRY_SECONDS);
  //
  // const readUrl = supabase.storage
  //   .from(TEST_UPLOADS_BUCKET)
  //   .getSignedUrl(storageKey, SIGNED_URL_EXPIRY_SECONDS);
  //
  // if (error) throw new StorageError("storage_error", error.message);

  return {
    storageKey,
    uploadUrl: `https://mock-storage.example.com/upload/${storageKey}`,
    readUrl: `https://mock-storage.example.com/read/${storageKey}`,
    expiresAt,
  };
}
