import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";

import "./personalize-stepper.css";
import { useStepperStore } from "./stepper-store";
import { Trigger } from "./components/Trigger";
import { Shell } from "./components/Shell";

const StepperApp = () => {
  const { config } = useStepperStore();
  const isPreview = config.isPreview === true;

  return (
    <>
      <Trigger />
      {!isPreview && <Shell />}
    </>
  );
};

type StepperMount = HTMLElement & {
  __pd_stepper_root?: Root;
};

const roots = new WeakMap<HTMLElement, Root>();

const initializeFromDataset = (mount: HTMLElement) => {
  const shopDomain = mount.dataset.shopDomain;
  const productId = mount.dataset.productGid || mount.dataset.productId;
  const variantId = mount.dataset.variantGid || mount.dataset.variantId;
  const productTitle = mount.dataset.productTitle;
  const variantTitle = mount.dataset.variantTitle;
  // Use variant image if available, otherwise fall back to product image
  const variantImageUrl = mount.dataset.variantImage;
  const productImageUrl = variantImageUrl || mount.dataset.productImage;
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

  const isPreview = mount.dataset.isPreview === "true";

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
      variantId,
      templateId,
      personalizationEnabled,
      textEnabled,
      useThemeStyle,
      buttonText,
      isPreview,
    });
  }

  useStepperStore.getState().setConfig({
    shopDomain,
    productId,
    variantId,
    productTitle,
    variantTitle,
    productImageUrl,
    templateId,
    personalizationEnabled,
    textEnabled,
    isPreview,
  });

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
};

const mountStepper = (mount: StepperMount) => {
  initializeFromDataset(mount);

  const existingRoot = mount.__pd_stepper_root || roots.get(mount);
  if (existingRoot) {
    existingRoot.render(<StepperApp />);
    return;
  }

  const root = createRoot(mount);
  mount.__pd_stepper_root = root;
  roots.set(mount, root);
  root.render(<StepperApp />);

  // Listen for variant changes from the parent container
  const container = mount.closest("[data-pd-stepper-container]");
  if (container) {
    container.addEventListener("pd:variantchange", (event: Event) => {
      const customEvent = event as CustomEvent<{
        variantId: string;
        variantGid: string;
        variantTitle: string;
        variantImage?: string;
      }>;

      const { variantId, variantGid, variantTitle, variantImage } =
        customEvent.detail;

      // Update the dataset
      mount.dataset.variantId = variantId;
      mount.dataset.variantGid = variantGid;
      mount.dataset.variantTitle = variantTitle;
      if (variantImage) {
        mount.dataset.variantImage = variantImage;
      }

      // Update the Zustand store
      useStepperStore.getState().setConfig({
        variantId: variantGid || variantId,
        variantTitle,
        // Use variant image if available, otherwise keep existing product image
        productImageUrl: variantImage || mount.dataset.productImage,
      });

      if (import.meta.env?.DEV) {
        // eslint-disable-next-line no-console
        console.info("[pd-stepper] Variant updated:", {
          variantId,
          variantTitle,
          variantImage: variantImage ? "present" : "not present",
        });
      }
    });
  }
};

const mountAll = () => {
  const mounts = document.querySelectorAll<HTMLElement>(
    "[data-pd-stepper-root]",
  );
  mounts.forEach((mount) => mountStepper(mount as StepperMount));
};

if (typeof window !== "undefined") {
  const win = window as unknown as {
    __pd_stepper_mount?: (mount?: HTMLElement) => void;
    __pd_stepper_mount_queue?: HTMLElement[];
    __pd_stepper_assets_loaded?: boolean;
    __pd_stepper_assets_loading?: boolean;
  };

  win.__pd_stepper_mount = (mount?: HTMLElement) => {
    if (mount) {
      mountStepper(mount as StepperMount);
      return;
    }
    mountAll();
  };

  const queued = win.__pd_stepper_mount_queue;
  if (Array.isArray(queued) && queued.length > 0) {
    queued.forEach((mount) => mountStepper(mount as StepperMount));
    win.__pd_stepper_mount_queue = [];
  }

  win.__pd_stepper_assets_loaded = true;
  win.__pd_stepper_assets_loading = false;
}

mountAll();
