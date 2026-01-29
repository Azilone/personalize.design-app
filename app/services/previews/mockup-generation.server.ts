import { createTempProduct } from "../printify/temp-product.server";

export type GenerateMockupsParams = {
  designUrl: string;
  blueprintId: number;
  printProviderId: number;
  variants: Array<{ id: number; price: number; isEnabled?: boolean }>;
  printArea: {
    position?: string;
    scale?: number;
    width: number;
    height: number;
  };
  shopId: string;
};

export type GenerateMockupsResult = {
  mockupUrls: string[];
  tempProductId: string;
};

export const generateMockups = async (
  params: GenerateMockupsParams,
): Promise<GenerateMockupsResult> => {
  const tempProduct = await createTempProduct(
    params.shopId,
    params.blueprintId,
    params.printProviderId,
    params.variants,
    {
      url: params.designUrl,
      position: params.printArea.position,
      scale: params.printArea.scale,
    },
  );

  return {
    mockupUrls: tempProduct.mockupUrls,
    tempProductId: tempProduct.productId,
  };
};
