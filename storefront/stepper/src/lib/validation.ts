import { validateBrowserSupport } from "./browser-support";

export const MAX_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_IMAGE_DIMENSION = 4096; // fal.ai max dimension
export const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/avif",
];

/**
 * Gets image dimensions from a file.
 * @param file - The image file
 * @returns Promise resolving to { width, height }
 */
export function getImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

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

  // Check image dimensions
  try {
    const dimensions = await getImageDimensions(file);
    if (
      dimensions.width > MAX_IMAGE_DIMENSION ||
      dimensions.height > MAX_IMAGE_DIMENSION
    ) {
      return `Image dimensions are too large (${dimensions.width}x${dimensions.height}). Maximum allowed is ${MAX_IMAGE_DIMENSION}x${MAX_IMAGE_DIMENSION} pixels.`;
    }
  } catch {
    // If we can't read dimensions, we'll let the server handle it
    // but log this for debugging
    if (import.meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.warn(
        "[validation] Could not read image dimensions for",
        file.name,
      );
    }
  }

  return null;
}
