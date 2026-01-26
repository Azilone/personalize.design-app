import { validateBrowserSupport } from "./browser-support";

export const MAX_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/avif",
];

/**
 * Validates a file on the client side.
 * NOTE: Client-side validation is NOT sufficient for security.
 * Server-side validation with magic bytes detection is REQUIRED.
 *
 * @param file - The file to validate
 * @returns Error message if validation fails, null if valid
 */
export async function validateFile(file: File): Promise<string | null> {
  // Check MIME type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return "Unsupported file type. Please upload JPEG, PNG, WEBP, HEIC, or AVIF.";
  }

  // Check browser support
  const browserError = await validateBrowserSupport(file.type);
  if (browserError) {
    return browserError;
  }

  // Check file size
  if (file.size > MAX_SIZE) {
    return "File size exceeds 10MB limit.";
  }

  return null;
}
