import { create } from "zustand";

type StepperState = {
  step: number;
  totalSteps: number;
  isOpen: boolean;
  config: {
    shopDomain?: string;
    productId?: string;
    productTitle?: string;
    variantTitle?: string;
    productImageUrl?: string;
    templateId?: string;
    personalizationEnabled?: boolean;
    textEnabled?: boolean;
  };
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
  previewJobId: string | null;
  generationStatus: "idle" | "pending" | "processing" | "succeeded" | "failed";
  previewUrl: string | null;
  generationError: string | null;
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
  setPreviewJobId: (jobId: string | null) => void;
  setGenerationStatus: (status: StepperState["generationStatus"]) => void;
  setPreviewUrl: (url: string | null) => void;
  setGenerationError: (error: string | null) => void;
  resetPreview: () => void;
  setTriggerRef: (
    ref: React.MutableRefObject<HTMLButtonElement | null>,
  ) => void;
};

export const useStepperStore = create<StepperState>((set) => ({
  step: 1,
  totalSteps: 3,
  isOpen: false,
  config: {},
  templateConfig: null,
  file: null,
  graphicFile: null,
  variableValues: {},
  previewJobId: null,
  generationStatus: "idle",
  previewUrl: null,
  generationError: null,
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
  setConfig: (config) => set({ config }),
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
  setPreviewJobId: (previewJobId) => set({ previewJobId }),
  setGenerationStatus: (generationStatus) => set({ generationStatus }),
  setPreviewUrl: (previewUrl) => set({ previewUrl }),
  setGenerationError: (generationError) => set({ generationError }),
  resetPreview: () =>
    set({
      previewJobId: null,
      generationStatus: "idle",
      previewUrl: null,
      generationError: null,
    }),
  setTriggerRef: (ref) => set({ triggerRef: ref }),
}));
