export type PrintAreaDimensions = {
  width: number;
  height: number;
};

export type PrintAreaTransformInput = {
  coverPrintArea: boolean;
  imageSize: { width: number; height: number };
  printAreaDimensions: PrintAreaDimensions | null;
};

export type PrintAreaTransform = {
  x: number;
  y: number;
  scale: number;
  angle: number;
};

export const buildPrintAreaTransform = (
  input: PrintAreaTransformInput,
): PrintAreaTransform => {
  let scale = 1;

  if (!input.coverPrintArea && input.printAreaDimensions) {
    const imageAspectRatio = input.imageSize.width / input.imageSize.height;
    const maxScaleByHeight =
      (input.printAreaDimensions.height * imageAspectRatio) /
      input.printAreaDimensions.width;
    scale = Math.min(1, maxScaleByHeight);
  }

  return {
    x: 0.5,
    y: 0.5,
    scale,
    angle: 0,
  };
};
