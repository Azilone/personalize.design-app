import { inngestFunctions as templateTestFunctions } from "./functions/template-test-generate.server";
import { productsSync } from "./functions/products-sync.server";
import { inngestFunctions as merchantPreviewFunctions } from "./functions/merchant-preview-generation.server";
import { inngestFunctions as buyerPreviewFunctions } from "./functions/buyer-preview-generation.server";

export const inngestFunctions = [
  ...templateTestFunctions,
  ...merchantPreviewFunctions,
  ...buyerPreviewFunctions,
  productsSync,
];
