import { create } from "zustand";

type ButtonStyles = {
  useThemeStyle: boolean;
  buttonText: string;
  buttonTextApplied: string;
  buttonExtraClasses: string;
  buttonExtraClassesApplied: string;
  buttonBgColor: string;
  buttonTextColor: string;
  buttonPadding: string;
  buttonFontSize: string;
};

type StepperState = {
  step: number;
  totalSteps: number;
  isOpen: boolean;
  config: {
    shopDomain?: string;
    productId?: string;
    variantId?: string;
    productTitle?: string;
    variantTitle?: string;
    productImageUrl?: string;
    templateId?: string;
    personalizationEnabled?: boolean;
    textEnabled?: boolean;
    isPreview?: boolean;
  };
  buttonStyles: ButtonStyles;
  templateConfig: {
    templateId: string;
    templateName: string;
    photoRequired: boolean;
    textInputEnabled: boolean;
    variables: Array<{ id: string; name: string }>;
  } | null;
  file: File | null;
  graphicFile: File | null;
  variableValues: Record<string, string>;
  sessionId: string | null;
  previewJobId: string | null;
  generationStatus: "idle" | "pending" | "processing" | "succeeded" | "failed";
  previewUrl: string | null;
  generationError: string | null;
  serverJobConfirmed: boolean;
  mockupUrls: string[];
  mockupStatus: "idle" | "loading" | "ready" | "error";
  mockupError: string | null;
  // Add-to-cart state
  addToCartStatus: "idle" | "loading" | "success" | "error";
  addToCartError: string | null;
  cartUrl: string | null;
  // Limit tracking
  triesRemaining: number | null;
  perProductTriesRemaining: number | null;
  perSessionTriesRemaining: number | null;
  resetAt: string | null;
  resetInMinutes: number | null;
  canRegenerate: boolean;
  regenerationCostUsd: number | null;
  triggerRef: React.MutableRefObject<HTMLButtonElement | null> | null;
  setStep: (step: number) => void;
  next: () => void;
  prev: () => void;
  open: () => void;
  close: () => void;
  setConfig: (config: StepperState["config"]) => void;
  setTemplateConfig: (config: StepperState["templateConfig"]) => void;
  setFile: (file: File | null) => void;
  setGraphicFile: (file: File | null) => void;
  setVariableValue: (name: string, value: string) => void;
  setVariableValues: (values: Record<string, string>) => void;
  resetInputs: () => void;
  setSessionId: (sessionId: string | null) => void;
  setPreviewJobId: (jobId: string | null) => void;
  setGenerationStatus: (status: StepperState["generationStatus"]) => void;
  setPreviewUrl: (url: string | null) => void;
  setGenerationError: (error: string | null) => void;
  setServerJobConfirmed: (confirmed: boolean) => void;
  setMockupUrls: (urls: string[]) => void;
  setMockupStatus: (status: StepperState["mockupStatus"]) => void;
  setMockupError: (error: string | null) => void;
  setAddToCartStatus: (status: StepperState["addToCartStatus"]) => void;
  setAddToCartError: (error: string | null) => void;
  setCartUrl: (url: string | null) => void;
  setTriesRemaining: (triesRemaining: number | null) => void;
  setPerProductTriesRemaining: (
    perProductTriesRemaining: number | null,
  ) => void;
  setPerSessionTriesRemaining: (
    perSessionTriesRemaining: number | null,
  ) => void;
  setResetAt: (resetAt: string | null) => void;
  setResetInMinutes: (resetInMinutes: number | null) => void;
  setCanRegenerate: (canRegenerate: boolean) => void;
  setRegenerationCostUsd: (regenerationCostUsd: number | null) => void;
  resetPreview: () => void;
  setTriggerRef: (
    ref: React.MutableRefObject<HTMLButtonElement | null>,
  ) => void;
  setButtonStyles: (styles: ButtonStyles) => void;
};

const defaultButtonStyles: ButtonStyles = {
  useThemeStyle: true,
  buttonText: "Personalize",
  buttonTextApplied: "Remove saved design",
  buttonExtraClasses: "",
  buttonExtraClassesApplied: "",
  buttonBgColor: "#007BFF",
  buttonTextColor: "#FFFFFF",
  buttonPadding: "12px 24px",
  buttonFontSize: "16px",
};

export const useStepperStore = create<StepperState>((set) => ({
  step: 1,
  totalSteps: 3,
  isOpen: false,
  config: {},
  buttonStyles: defaultButtonStyles,
  templateConfig: null,
  file: null,
  graphicFile: null,
  variableValues: {},
  sessionId: null,
  previewJobId: null,
  generationStatus: "idle",
  previewUrl: null,
  generationError: null,
  serverJobConfirmed: false,
  mockupUrls: [],
  mockupStatus: "idle",
  mockupError: null,
  // Add-to-cart defaults
  addToCartStatus: "idle",
  addToCartError: null,
  cartUrl: null,
  // Limit tracking defaults
  triesRemaining: null,
  perProductTriesRemaining: null,
  perSessionTriesRemaining: null,
  resetAt: null,
  resetInMinutes: null,
  canRegenerate: true,
  regenerationCostUsd: null,
  triggerRef: null,
  setStep: (step) => set({ step }),
  next: () =>
    set((state) => ({
      step: Math.min(state.step + 1, state.totalSteps),
    })),
  prev: () =>
    set((state) => ({
      step: Math.max(state.step - 1, 1),
    })),
  open: () => set({ isOpen: true }),
  close: () =>
    set((state) => {
      if (state.triggerRef?.current) {
        state.triggerRef.current.focus();
      }
      return { isOpen: false };
    }),
  setConfig: (config) =>
    set((state) => ({ config: { ...state.config, ...config } })),
  setTemplateConfig: (templateConfig) => set({ templateConfig }),
  setFile: (file) => set({ file }),
  setGraphicFile: (graphicFile) => set({ graphicFile }),
  setVariableValue: (name, value) =>
    set((state) => ({
      variableValues: {
        ...state.variableValues,
        [name]: value,
      },
    })),
  setVariableValues: (values) => set({ variableValues: values }),
  resetInputs: () => set({ file: null, graphicFile: null, variableValues: {} }),
  setSessionId: (sessionId) => set({ sessionId }),
  setPreviewJobId: (previewJobId) => set({ previewJobId }),
  setGenerationStatus: (generationStatus) => set({ generationStatus }),
  setPreviewUrl: (previewUrl) => set({ previewUrl }),
  setGenerationError: (generationError) => set({ generationError }),
  setServerJobConfirmed: (serverJobConfirmed) => set({ serverJobConfirmed }),
  setMockupUrls: (mockupUrls) => set({ mockupUrls }),
  setMockupStatus: (mockupStatus) => set({ mockupStatus }),
  setMockupError: (mockupError) => set({ mockupError }),
  setAddToCartStatus: (addToCartStatus) => set({ addToCartStatus }),
  setAddToCartError: (addToCartError) => set({ addToCartError }),
  setCartUrl: (cartUrl) => set({ cartUrl }),
  setTriesRemaining: (triesRemaining) => set({ triesRemaining }),
  setPerProductTriesRemaining: (perProductTriesRemaining) =>
    set({ perProductTriesRemaining }),
  setPerSessionTriesRemaining: (perSessionTriesRemaining) =>
    set({ perSessionTriesRemaining }),
  setResetAt: (resetAt) => set({ resetAt }),
  setResetInMinutes: (resetInMinutes) => set({ resetInMinutes }),
  setCanRegenerate: (canRegenerate) => set({ canRegenerate }),
  setRegenerationCostUsd: (regenerationCostUsd) => set({ regenerationCostUsd }),
  resetPreview: () =>
    set({
      previewJobId: null,
      generationStatus: "idle",
      previewUrl: null,
      generationError: null,
      serverJobConfirmed: false,
      mockupUrls: [],
      mockupStatus: "idle",
      mockupError: null,
    }),
  setTriggerRef: (ref) => set({ triggerRef: ref }),
  setButtonStyles: (buttonStyles) => set({ buttonStyles }),
}));
