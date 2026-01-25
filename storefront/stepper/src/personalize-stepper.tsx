import { createRoot } from "react-dom/client";

import "./personalize-stepper.css";
import { useStepperStore } from "./stepper-store";

const StepperShell = () => {
  const step = useStepperStore((state) => state.step);
  const totalSteps = useStepperStore((state) => state.totalSteps);
  const next = useStepperStore((state) => state.next);
  const prev = useStepperStore((state) => state.prev);

  return (
    <div className="pd-stepper-shell w-full max-w-xl rounded-[var(--radius)] border border-border bg-background/90 p-6 text-foreground shadow-xl">
      <div className="flex items-center justify-between text-sm uppercase tracking-[0.2em] text-muted-foreground">
        <span>Personalize</span>
        <span>
          Step {step} of {totalSteps}
        </span>
      </div>
      <h2 className="mt-4 text-3xl font-semibold">
        Design your personalized product
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        This is the storefront stepper shell. UI steps will replace this
        placeholder as the flow lands.
      </p>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          className="rounded-full border border-border px-4 py-2 text-sm"
          onClick={prev}
        >
          Back
        </button>
        <button
          type="button"
          className="rounded-full bg-primary px-5 py-2 text-sm text-primary-foreground"
          onClick={next}
        >
          Continue
        </button>
      </div>
    </div>
  );
};

const mount = document.querySelector<HTMLElement>("#pd-stepper-root");

if (mount) {
  createRoot(mount).render(<StepperShell />);
}
