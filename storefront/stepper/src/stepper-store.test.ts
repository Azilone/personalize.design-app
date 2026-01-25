import { beforeEach, describe, expect, it } from "vitest";

import { useStepperStore } from "./stepper-store";

describe("useStepperStore", () => {
  beforeEach(() => {
    useStepperStore.setState({
      step: 1,
      totalSteps: 3,
    });
  });

  it("increments and clamps the step", () => {
    const { next } = useStepperStore.getState();

    next();
    expect(useStepperStore.getState().step).toBe(2);

    next();
    next();
    expect(useStepperStore.getState().step).toBe(3);
  });

  it("decrements and clamps the step", () => {
    useStepperStore.setState({
      step: 2,
    });

    const { prev } = useStepperStore.getState();
    prev();
    prev();

    expect(useStepperStore.getState().step).toBe(1);
  });
});
