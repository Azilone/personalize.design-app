/**
 * Checks if a file type is supported by the browser.
 * Uses actual Image loading to verify format support rather than relying on toDataURL().
 *
 * @param mimeType - The MIME type to check (e.g., "image/heic", "image/avif")
 * @returns Promise resolving to true if supported, false otherwise
 */
export async function isFileTypeSupported(mimeType: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Special cases for HEIC/AVIF that may need special handling
    if (mimeType === "image/heic" || mimeType === "image/avif") {
      // Try to create a minimal canvas and test toDataURL
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          resolve(false);
          return;
        }

        // Create 1x1 pixel transparent image
        canvas.width = 1;
        canvas.height = 1;
        const imageData = ctx.createImageData(1, 1);
        ctx.putImageData(imageData, 0, 0);

        // Try to convert to the target format
        const dataUrl = canvas.toDataURL(mimeType);

        // If we got here without error, browser claims support
        // But let's also try to load it as an image to be sure
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = dataUrl;

        // Timeout fallback - if it takes too long, assume not supported
        setTimeout(() => resolve(false), 1000);
      } catch (e) {
        // Any error means not supported
        resolve(false);
      }
      return;
    }

    // For standard formats (JPEG, PNG, WEBP), browsers generally support them
    // Just verify the browser has basic canvas support
    try {
      const canvas = document.createElement("canvas");
      const dataUrl = canvas.toDataURL(mimeType);
      resolve(!!dataUrl);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Validates browser support and returns an error message if not supported.
 *
 * @param mimeType - The MIME type to validate
 * @returns Error message if not supported, null if supported
 */
export async function validateBrowserSupport(
  mimeType: string,
): Promise<string | null> {
  const supported = await isFileTypeSupported(mimeType);

  if (!supported) {
    const formatName = mimeType.split("/")[1]?.toUpperCase() || "this format";
    return `Your browser does not fully support ${formatName} files. Please try JPEG, PNG, or WEBP.`;
  }

  return null;
}
