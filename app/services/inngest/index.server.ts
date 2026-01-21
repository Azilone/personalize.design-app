import { inngestFunctions as templateTestFunctions } from "./functions/template-test-generate.server";
import { productsSync } from "./functions/products-sync.server";

export const inngestFunctions = [...templateTestFunctions, productsSync];
