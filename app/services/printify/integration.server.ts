import prisma from "../../db.server";
import type { EncryptedToken } from "./token-encryption.server";

export type PrintifyIntegration = {
  shopId: string;
  printifyShopId: string;
  printifyShopTitle: string;
  printifySalesChannel: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export const getPrintifyIntegration = async (
  shopId: string,
): Promise<PrintifyIntegration | null> => {
  const integration = await prisma.shopPrintifyIntegration.findUnique({
    where: { shop_id: shopId },
    select: {
      shop_id: true,
      printify_shop_id: true,
      printify_shop_title: true,
      printify_sales_channel: true,
      created_at: true,
      updated_at: true,
    },
  });

  if (!integration) {
    return null;
  }

  return {
    shopId: integration.shop_id,
    printifyShopId: integration.printify_shop_id,
    printifyShopTitle: integration.printify_shop_title,
    printifySalesChannel: integration.printify_sales_channel,
    createdAt: integration.created_at,
    updatedAt: integration.updated_at,
  };
};

export type UpsertPrintifyIntegrationInput = {
  shopId: string;
  encryptedToken: EncryptedToken;
  printifyShopId: string;
  printifyShopTitle: string;
  printifySalesChannel: string | null;
};

export const upsertPrintifyIntegration = async (
  input: UpsertPrintifyIntegrationInput,
) => {
  return prisma.shopPrintifyIntegration.upsert({
    where: { shop_id: input.shopId },
    update: {
      token_ciphertext: input.encryptedToken.ciphertext,
      token_iv: input.encryptedToken.iv,
      token_auth_tag: input.encryptedToken.authTag,
      printify_shop_id: input.printifyShopId,
      printify_shop_title: input.printifyShopTitle,
      printify_sales_channel: input.printifySalesChannel,
    },
    create: {
      shop_id: input.shopId,
      token_ciphertext: input.encryptedToken.ciphertext,
      token_iv: input.encryptedToken.iv,
      token_auth_tag: input.encryptedToken.authTag,
      printify_shop_id: input.printifyShopId,
      printify_shop_title: input.printifyShopTitle,
      printify_sales_channel: input.printifySalesChannel,
    },
  });
};
