import type { LoaderFunctionArgs } from "react-router";

import { authenticate } from "../../../shopify.server";
import { getShopIdFromSession } from "../../../lib/tenancy";
import {
  buildReadinessChecklist,
  type ReadinessItem,
} from "../../../lib/readiness";
import { PlanStatus } from "@prisma/client";
import { getShopPlan } from "../../../services/shops/plan.server";
import {
  getShopReadinessSignals,
  type ShopReadinessSignals,
} from "../../../services/shops/readiness.server";

export type ReadinessLoaderData = {
  readinessItems: ReadinessItem[];
  readinessSignals: ShopReadinessSignals;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);
  const plan = await getShopPlan(shopId);
  const planStatus = plan?.plan_status ?? PlanStatus.none;
  const readinessSignals = await getShopReadinessSignals(shopId);

  const readinessItems = buildReadinessChecklist({
    planStatus,
    ...readinessSignals,
  });

  const data: ReadinessLoaderData = {
    readinessItems,
    readinessSignals,
  };

  return data;
};
