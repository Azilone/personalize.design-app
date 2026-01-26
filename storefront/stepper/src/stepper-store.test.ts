import { beforeEach, describe, expect, it, vi } from "vitest";

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

  it("manages isOpen state", () => {
    const { open, close } = useStepperStore.getState();
    expect(useStepperStore.getState().isOpen).toBe(false);

    open();
    expect(useStepperStore.getState().isOpen).toBe(true);

    close();
    expect(useStepperStore.getState().isOpen).toBe(false);
  });

  it("updates config", () => {
    const config = {
      shopDomain: "test",
      productId: "1",
      templateId: "t1",
      personalizationEnabled: true,
      textEnabled: false,
    };
    const { setConfig } = useStepperStore.getState();
    setConfig(config);
    expect(useStepperStore.getState().config).toEqual(config);
  });

  it("returns focus to trigger on close", () => {
    const mockFocus = vi.fn();
    const mockElement = {
      focus: mockFocus,
    } as unknown as HTMLButtonElement;

    const mockRef = { current: mockElement };
    const { open, close, setTriggerRef } = useStepperStore.getState();

    setTriggerRef(mockRef);
    open();
    expect(useStepperStore.getState().isOpen).toBe(true);

    close();
    expect(useStepperStore.getState().isOpen).toBe(false);
    expect(mockFocus).toHaveBeenCalledTimes(1);
  });

  it("manages input state", () => {
    const { setFile, setTextInput, resetInputs } = useStepperStore.getState();
    const file = new File(["test"], "test.png", { type: "image/png" });

    setFile(file);
    expect(useStepperStore.getState().file).toBe(file);

    setTextInput("Hello");
    expect(useStepperStore.getState().textInput).toBe("Hello");

    resetInputs();
    expect(useStepperStore.getState().file).toBeNull();
    expect(useStepperStore.getState().textInput).toBe("");
  });
});
