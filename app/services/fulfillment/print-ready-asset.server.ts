import {
  resolveAssetByPersonalizationId,
  type ResolvedAsset,
} from "./asset-resolution.server";
import type { PrintifyPrintAreaDimensions } from "../printify/print-area.server";

type EnsurePrintReadyAssetInput = {
  shopId: string;
  orderLineId: string;
  personalizationId: string;
  printAreaDimensions?: PrintifyPrintAreaDimensions | null;
};

export const ensurePrintReadyAsset = async (
  input: EnsurePrintReadyAssetInput,
): Promise<ResolvedAsset> => {
  return resolveAssetByPersonalizationId(
    input.shopId,
    input.orderLineId,
    input.personalizationId,
  );
};
