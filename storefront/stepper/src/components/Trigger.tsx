import { useStepperStore } from "../stepper-store";
import { Button } from "./ui/button";

export const Trigger = () => {
  const { config, open } = useStepperStore();

  if (!config.templateId || !config.personalizationEnabled) {
    return null;
  }

  return (
    <Button onClick={open} className="pd-trigger-button">
      Personalize
    </Button>
  );
};
