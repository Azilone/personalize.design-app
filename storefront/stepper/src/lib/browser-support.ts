export const isFileTypeSupported = (mimeType: string): boolean => {
  const canvas = document.createElement("canvas");

  if (mimeType === "image/heic") {
    return !!canvas.toDataURL("image/heic");
  }

  if (mimeType === "image/avif") {
    return !!canvas.toDataURL("image/avif");
  }

  return true;
};

export const validateBrowserSupport = (mimeType: string): string | null => {
  if (!isFileTypeSupported(mimeType)) {
    return `Your browser does not support ${mimeType.split("/")[1].toUpperCase()} files. Please try JPEG, PNG, or WEBP.`;
  }
  return null;
};
