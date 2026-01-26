import { useEffect, useRef } from "react";
import { useStepperStore } from "../stepper-store";
import { Button } from "./ui/button";

export const Trigger = () => {
  const { config, open, setTriggerRef } = useStepperStore();
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setTriggerRef(triggerRef);

    return () => {
      setTriggerRef(null as any);
    };
  }, [setTriggerRef]);

  const isLoaded =
    config.templateId !== undefined &&
    config.personalizationEnabled !== undefined;

  if (!isLoaded) {
    return (
      <Button
        disabled
        className="pd-trigger-button w-full h-[47px] rounded-[3px] px-8 text-[15px] font-normal tracking-[1px] font-['Helvetica',_'Arial',_sans-serif]"
      >
        Personalize
      </Button>
    );
  }

  if (!config.templateId || !config.personalizationEnabled) {
    return null;
  }

  return (
    <Button
      ref={triggerRef}
      onClick={open}
      className="pd-trigger-button w-full h-[47px] rounded-[3px] px-8 text-[15px] font-normal tracking-[1px] font-['Helvetica',_'Arial',_sans-serif]"
      aria-label="Personalize this product"
    >
      Personalize
    </Button>
  );
};
