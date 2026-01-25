import { create } from "zustand";

type StepperState = {
  step: number;
  totalSteps: number;
  setStep: (step: number) => void;
  next: () => void;
  prev: () => void;
};

export const useStepperStore = create<StepperState>((set) => ({
  step: 1,
  totalSteps: 3,
  setStep: (step) => set({ step }),
  next: () =>
    set((state) => ({
      step: Math.min(state.step + 1, state.totalSteps),
    })),
  prev: () =>
    set((state) => ({
      step: Math.max(state.step - 1, 1),
    })),
}));
