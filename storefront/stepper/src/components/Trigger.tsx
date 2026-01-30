import { useEffect, useRef, useMemo } from "react";
import { useStepperStore } from "../stepper-store";

export const Trigger = () => {
  const { config, buttonStyles, open, setTriggerRef } = useStepperStore();
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setTriggerRef(triggerRef);

    return () => {
      setTriggerRef(null as any);
    };
  }, [setTriggerRef]);

  // Compute button classes based on settings and personalization state
  const buttonClasses = useMemo(() => {
    const baseClasses = ["pd-personalize-button"];

    // Add custom style class when not using theme style
    if (!buttonStyles.useThemeStyle) {
      baseClasses.push("pd-custom-style");
    }

    // Add extra classes from block settings
    if (buttonStyles.buttonExtraClasses) {
      baseClasses.push(...buttonStyles.buttonExtraClasses.split(" "));
    }

    return baseClasses.join(" ");
  }, [buttonStyles.useThemeStyle, buttonStyles.buttonExtraClasses]);

  // Compute inline styles for custom styling (only when theme style is disabled)
  const buttonInlineStyles = useMemo(() => {
    if (buttonStyles.useThemeStyle) {
      return undefined;
    }

    return {
      backgroundColor: buttonStyles.buttonBgColor,
      color: buttonStyles.buttonTextColor,
      padding: buttonStyles.buttonPadding,
      fontSize: buttonStyles.buttonFontSize,
    };
  }, [
    buttonStyles.useThemeStyle,
    buttonStyles.buttonBgColor,
    buttonStyles.buttonTextColor,
    buttonStyles.buttonPadding,
    buttonStyles.buttonFontSize,
  ]);

  // In preview mode, always show the button (for theme editor)
  // In normal mode, only show if product is personalized
  const shouldShowButton =
    config.isPreview ||
    (Boolean(config.templateId) && config.personalizationEnabled === true);

  if (!shouldShowButton) {
    return null;
  }

  // In preview mode, clicking the button shows a tooltip/alert instead of opening the modal
  const handleClick = () => {
    if (config.isPreview) {
      // Show a visual feedback that this is just a preview
      alert(
        "This is a preview button. It will open the personalization modal for products with personalization enabled.",
      );
      return;
    }
    open();
  };

  return (
    <div className="pd-trigger-wrapper">
      {config.isPreview && <div className="pd-preview-label">Preview</div>}
      <button
        ref={triggerRef}
        onClick={handleClick}
        className={buttonClasses}
        style={buttonInlineStyles}
        aria-label="Personalize this product"
      >
        {buttonStyles.buttonText}
      </button>
    </div>
  );
};
