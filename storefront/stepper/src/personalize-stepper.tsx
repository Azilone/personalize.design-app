import { createRoot } from "react-dom/client";

import "./personalize-stepper.css";
import { useStepperStore } from "./stepper-store";
import { Trigger } from "./components/Trigger";
import { Shell } from "./components/Shell";

const StepperApp = () => {
  return (
    <>
      <Trigger />
      <Shell />
    </>
  );
};

const mount = document.querySelector<HTMLElement>("#pd-stepper-root");

if (mount) {
  // Read data attributes
  const shopDomain = mount.dataset.shopDomain;
  const productId = mount.dataset.productGid || mount.dataset.productId;
  const productTitle = mount.dataset.productTitle;
  const variantTitle = mount.dataset.variantTitle;
  const productImageUrl = mount.dataset.productImage;
  const templateIdRaw = mount.dataset.templateId;
  const templateId = templateIdRaw ? templateIdRaw : undefined;
  const personalizationEnabledRaw = mount.dataset.personalizationEnabled;
  const personalizationEnabled =
    personalizationEnabledRaw === undefined || personalizationEnabledRaw === ""
      ? undefined
      : personalizationEnabledRaw === "true";
  const textEnabledRaw = mount.dataset.textEnabled;
  const textEnabled =
    textEnabledRaw === undefined || textEnabledRaw === ""
      ? undefined
      : textEnabledRaw === "true";

  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.info("[pd-stepper] dataset", {
      shopDomain,
      productId,
      templateId,
      personalizationEnabled,
      textEnabled,
    });
  }

  // Initialize store
  useStepperStore.getState().setConfig({
    shopDomain,
    productId,
    productTitle,
    variantTitle,
    productImageUrl,
    templateId,
    personalizationEnabled,
    textEnabled,
  });

  createRoot(mount).render(<StepperApp />);
}
