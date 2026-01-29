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

  // Check if this is a preview mode (theme editor)
  const isPreview = mount.dataset.isPreview === "true";

  // Read button style settings from block
  const useThemeStyle = mount.dataset.useThemeStyle !== "false";
  const buttonText = mount.dataset.buttonText || "Personalize";
  const buttonTextApplied =
    mount.dataset.buttonTextApplied || "Remove saved design";
  const buttonExtraClasses = mount.dataset.buttonExtraClasses || "";
  const buttonExtraClassesApplied =
    mount.dataset.buttonExtraClassesApplied || "";
  const buttonBgColor = mount.dataset.buttonBgColor || "#007BFF";
  const buttonTextColor = mount.dataset.buttonTextColor || "#FFFFFF";
  const buttonPadding = mount.dataset.buttonPadding || "12px 24px";
  const buttonFontSize = mount.dataset.buttonFontSize || "16px";

  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.info("[pd-stepper] dataset", {
      shopDomain,
      productId,
      templateId,
      personalizationEnabled,
      textEnabled,
      useThemeStyle,
      buttonText,
      isPreview,
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
    isPreview,
  });

  // Initialize button styles
  useStepperStore.getState().setButtonStyles({
    useThemeStyle,
    buttonText,
    buttonTextApplied,
    buttonExtraClasses,
    buttonExtraClassesApplied,
    buttonBgColor,
    buttonTextColor,
    buttonPadding,
    buttonFontSize,
  });

  createRoot(mount).render(<StepperApp />);
}
