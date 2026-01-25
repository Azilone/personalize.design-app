import { validateBrowserSupport } from "./browser-support";

export const MAX_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/avif",
];

export const validateFile = (file: File): string | null => {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return "Unsupported file type. Please upload JPEG, PNG, WEBP, HEIC, or AVIF.";
  }

  const browserError = validateBrowserSupport(file.type);
  if (browserError) {
    return browserError;
  }

  if (file.size > MAX_SIZE) {
    return "File size exceeds 10MB limit.";
  }
  return null;
};
