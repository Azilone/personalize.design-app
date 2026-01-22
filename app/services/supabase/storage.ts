/**
 * Supabase Storage service for file uploads.
 *
 * Handles:
 * - Signed URL generation for uploads
 * - Signed URL generation for reads
 * - File type validation
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

let supabaseClient: SupabaseClient | null | undefined;

const isHttpUrl = (value: string): boolean =>
  value.startsWith("https://") || value.startsWith("http://");

const getSupabaseClient = (): SupabaseClient | null => {
  if (supabaseClient !== undefined) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
  const hasAnyConfig = Boolean(supabaseUrl || supabaseServiceKey);

  if (hasAnyConfig) {
    if (!supabaseUrl || !supabaseServiceKey || !isHttpUrl(supabaseUrl)) {
      throw new StorageError(
        "storage_error",
        "Supabase storage is misconfigured. Set SUPABASE_URL to the project HTTPS URL and SUPABASE_SERVICE_KEY to the service role key.",
        false,
      );
    }
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    supabaseClient = null;
    return supabaseClient;
  }

  supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
    },
  });

  return supabaseClient;
};

export const isSupabaseConfigured = (): boolean => {
  return getSupabaseClient() !== null;
};

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
  if (
    !ALLOWED_FILE_TYPES.includes(
      extension as (typeof ALLOWED_FILE_TYPES)[number],
    )
  ) {
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

  const supabase = getSupabaseClient();
  if (!supabase) {
    if (process.env.NODE_ENV === "production") {
      throw new StorageError(
        "storage_error",
        "Supabase storage is not configured.",
        false,
      );
    }

    return {
      storageKey,
      uploadUrl: `https://mock-storage.example.com/upload/${storageKey}`,
      readUrl: `https://mock-storage.example.com/read/${storageKey}`,
      expiresAt,
    };
  }

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(TEST_UPLOADS_BUCKET)
    .createSignedUploadUrl(storageKey);

  if (uploadError || !uploadData?.signedUrl) {
    throw new StorageError(
      "storage_error",
      uploadError?.message ?? "Unable to create upload URL.",
    );
  }

  const { data: readData, error: readError } = await supabase.storage
    .from(TEST_UPLOADS_BUCKET)
    .createSignedUrl(storageKey, SIGNED_URL_EXPIRY_SECONDS);

  if (readError || !readData?.signedUrl) {
    throw new StorageError(
      "storage_error",
      readError?.message ?? "Unable to create read URL.",
    );
  }

  return {
    storageKey,
    uploadUrl: uploadData.signedUrl,
    readUrl: readData.signedUrl,
    expiresAt,
  };
}

export async function uploadFileAndGetReadUrl(
  shopId: string,
  originalFilename: string,
  sizeBytes: number,
  fileBuffer: Buffer,
  contentType: string,
): Promise<UploadResult> {
  const extension = getFileExtension(originalFilename);
  validateFileType(extension);
  validateFileSize(sizeBytes);

  const storageKey = generateStorageKey(shopId, extension);
  const expiresAt = new Date(Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000);

  const supabase = getSupabaseClient();
  if (!supabase) {
    if (process.env.NODE_ENV === "production") {
      throw new StorageError(
        "storage_error",
        "Supabase storage is not configured.",
        false,
      );
    }

    return {
      storageKey,
      uploadUrl: `https://mock-storage.example.com/upload/${storageKey}`,
      readUrl: `https://mock-storage.example.com/read/${storageKey}`,
      expiresAt,
    };
  }

  const { error: uploadError } = await supabase.storage
    .from(TEST_UPLOADS_BUCKET)
    .upload(storageKey, fileBuffer, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    throw new StorageError("storage_error", uploadError.message);
  }

  const { data: readData, error: readError } = await supabase.storage
    .from(TEST_UPLOADS_BUCKET)
    .createSignedUrl(storageKey, SIGNED_URL_EXPIRY_SECONDS);

  if (readError || !readData?.signedUrl) {
    throw new StorageError(
      "storage_error",
      readError?.message ?? "Unable to create read URL.",
    );
  }

  return {
    storageKey,
    uploadUrl: readData.signedUrl,
    readUrl: readData.signedUrl,
    expiresAt,
  };
}
