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
  file: File | null;
  textInput: string;
  triggerRef: React.MutableRefObject<HTMLButtonElement | null> | null;
  setStep: (step: number) => void;
  next: () => void;
  prev: () => void;
  open: () => void;
  close: () => void;
  setConfig: (config: StepperState["config"]) => void;
  setFile: (file: File | null) => void;
  setTextInput: (text: string) => void;
  resetInputs: () => void;
  setTriggerRef: (
    ref: React.MutableRefObject<HTMLButtonElement | null>,
  ) => void;
};

export const useStepperStore = create<StepperState>((set) => ({
  step: 1,
  totalSteps: 3,
  isOpen: false,
  config: {},
  file: null,
  textInput: "",
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
  setFile: (file) => set({ file }),
  setTextInput: (textInput) => set({ textInput }),
  resetInputs: () => set({ file: null, textInput: "" }),
  setTriggerRef: (ref) => set({ triggerRef: ref }),
}));
