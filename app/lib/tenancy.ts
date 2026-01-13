export type SessionLike = {
  shop: string;
};

export const getShopIdFromSession = (session: SessionLike): string => {
  if (!session.shop) {
    throw new Error("Missing shop domain on session");
  }

  return session.shop;
};
