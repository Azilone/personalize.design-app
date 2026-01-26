export interface ValidationError {
  code: "INVALID_TYPE" | "TOO_LARGE" | "EXT_MISMATCH" | "VALIDATION_ERROR";
  message: string;
}

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/avif",
] as const;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Validates file upload on server side.
 * IMPORTANT: Client-side validation is NOT sufficient for security.
 * This function validates actual file content using magic bytes detection.
 *
 * @param file - The uploaded file (can be a File object or a buffer)
 * @returns ValidationError if validation fails, null if valid
 */
export async function validateUpload(
  file: File | Buffer,
): Promise<ValidationError | null> {
  let buffer: Buffer;
  let size: number;
  let fileName: string;

  if (file instanceof File) {
    const arrayBuffer = await file.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
    size = file.size;
    fileName = file.name;
  } else {
    buffer = file;
    size = file.length;
    fileName = "uploaded_file";
  }

  // Check file size first (quick fail)
  if (size > MAX_FILE_SIZE) {
    return {
      code: "TOO_LARGE",
      message: `File size ${formatSize(size)} exceeds maximum ${formatSize(MAX_FILE_SIZE)}`,
    };
  }

  // Validate MIME type using magic bytes
  const fileType = await validateFileType(buffer);

  if (!fileType) {
    return {
      code: "INVALID_TYPE",
      message: "Unable to determine file type",
    };
  }

  // Check if MIME type is allowed
  if (!ALLOWED_TYPES.includes(fileType.mime as any)) {
    return {
      code: "INVALID_TYPE",
      message: `File type "${fileType.mime}" is not allowed`,
    };
  }

  // Validate extension matches MIME type
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext !== fileType.ext) {
    return {
      code: "EXT_MISMATCH",
      message: `File extension ".${ext}" does not match actual content type (${fileType.mime})`,
    };
  }

  return null;
}

/**
 * Validates file type using magic bytes detection
 */
async function validateFileType(
  buffer: Buffer,
): Promise<{ mime: string; ext: string } | null> {
  const uint8Array = new Uint8Array(buffer);

  // Magic bytes signatures
  const signatures = [
    { ext: "jpg", mime: "image/jpeg", pattern: [0xff, 0xd8, 0xff] },
    { ext: "png", mime: "image/png", pattern: [0x89, 0x50, 0x4e, 0x47] },
    { ext: "webp", mime: "image/webp", pattern: [0x52, 0x49, 0x46, 0x46] }, // RIFF
    { ext: "heic", mime: "image/heic", pattern: [0x00, 0x00, 0x00, 0x18] }, // HEIC/HEIF (first 4 bytes of ftyp box)
    { ext: "avif", mime: "image/avif", pattern: [0x00, 0x00, 0x00, 0x20] }, // AVIF (ftyp box)
  ];

  for (const sig of signatures) {
    if (matchesPattern(uint8Array, sig.pattern)) {
      return { mime: sig.mime, ext: sig.ext };
    }
  }

  return null;
}

function matchesPattern(data: Uint8Array, pattern: number[]): boolean {
  if (data.length < pattern.length) {
    return false;
  }
  for (let i = 0; i < pattern.length; i++) {
    if (data[i] !== pattern[i]) {
      return false;
    }
  }
  return true;
}

function formatSize(bytes: number): string {
  const MB = 1024 * 1024;
  return `${(bytes / MB).toFixed(1)}MB`;
}
