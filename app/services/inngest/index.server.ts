import { productsSync } from "./functions/products-sync.server";
import { inngestFunctions as generationFunctions } from "./functions/generation.server";

export const inngestFunctions = [...generationFunctions, productsSync];
