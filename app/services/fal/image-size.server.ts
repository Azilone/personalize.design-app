import {
  DEFAULT_TEMPLATE_ASPECT_RATIO,
  type TemplateAspectRatio,
} from "../../lib/template-aspect-ratios";
import type { PrintifyPrintAreaDimensions } from "../printify/print-area.server";

export type ImageSize = {
  width: number;
  height: number;
};

const BASE_LONG_SIDE = 1024;

const TEMPLATE_ASPECT_RATIO_SIZES: Record<TemplateAspectRatio, ImageSize> = {
  ratio_1_1: { width: BASE_LONG_SIDE, height: BASE_LONG_SIDE },
  ratio_3_4: { width: 768, height: BASE_LONG_SIDE },
  ratio_4_3: { width: BASE_LONG_SIDE, height: 768 },
  ratio_9_16: { width: 576, height: BASE_LONG_SIDE },
  ratio_16_9: { width: BASE_LONG_SIDE, height: 576 },
};

export const calculateFalImageSize = (input: {
  coverPrintArea: boolean;
  templateAspectRatio?: TemplateAspectRatio | null;
  printAreaDimensions?: PrintifyPrintAreaDimensions | null;
}): ImageSize => {
  if (input.coverPrintArea && input.printAreaDimensions) {
    return {
      width: input.printAreaDimensions.width,
      height: input.printAreaDimensions.height,
    };
  }

  const ratio = input.templateAspectRatio ?? DEFAULT_TEMPLATE_ASPECT_RATIO;
  return TEMPLATE_ASPECT_RATIO_SIZES[ratio];
};
