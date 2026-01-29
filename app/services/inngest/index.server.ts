import { productsSync } from "./functions/products-sync.server";
import { inngestFunctions as previewFunctions } from "./functions/preview-generate.server";
import { inngestFunctions as templateTestFunctions } from "./functions/template-test-generate.server";
import { fulfillmentFunctions } from "./functions/fulfillment";

export const inngestFunctions = [
  ...previewFunctions,
  ...templateTestFunctions,
  ...fulfillmentFunctions,
  productsSync,
];
