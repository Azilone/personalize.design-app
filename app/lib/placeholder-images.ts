type PlaceholderSize = {
  width: number;
  height: number;
};

const PLACEHOLDER_LONG_SIDE = 1024;

const normalizePlaceholderSize = (size: PlaceholderSize): PlaceholderSize => {
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height)) {
    return { width: PLACEHOLDER_LONG_SIDE, height: PLACEHOLDER_LONG_SIDE };
  }

  const width = Math.max(1, size.width);
  const height = Math.max(1, size.height);
  const ratio = width / height;

  if (width >= height) {
    return {
      width: PLACEHOLDER_LONG_SIDE,
      height: Math.max(1, Math.round(PLACEHOLDER_LONG_SIDE / ratio)),
    };
  }

  return {
    width: Math.max(1, Math.round(PLACEHOLDER_LONG_SIDE * ratio)),
    height: PLACEHOLDER_LONG_SIDE,
  };
};

export const buildPlaceholderUrl = (size: PlaceholderSize): string => {
  const normalized = normalizePlaceholderSize(size);
  return `https://placehold.co/${normalized.width}x${normalized.height}.png`;
};
