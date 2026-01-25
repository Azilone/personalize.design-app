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
  const productId = mount.dataset.productId;
  const templateId = mount.dataset.templateId;
  const personalizationEnabled =
    mount.dataset.personalizationEnabled === "true";

  // Initialize store
  useStepperStore.getState().setConfig({
    shopDomain,
    productId,
    templateId,
    personalizationEnabled,
  });

  createRoot(mount).render(<StepperApp />);
}
