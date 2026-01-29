/**
 * Theme Style Detector
 * Automatically detects and copies styles from the theme's Add to Cart button
 * to ensure the Personalize button matches the theme's design.
 */

(function () {
  "use strict";

  // Configuration
  const CONFIG = {
    // Common selectors for Add to Cart buttons across different themes
    autoDetectSelectors: [
      'button[type="submit"][name="add"]',
      'button[name="add"]',
      ".product-form__submit",
      ".add-to-cart",
      ".product-add-to-cart",
      ".product-form__buttons button",
      "[data-add-to-cart]",
      ".btn-add-to-cart",
      ".button-add-to-cart",
      'form[action*="/cart/add"] button[type="submit"]',
    ],
    // CSS properties to copy from the theme button
    propertiesToCopy: [
      "background-image",
      "background-color",
      "color",
      "border-radius",
      "border-width",
      "border-style",
      "border-color",
      "outline",
      "outline-offset",
      "padding-top",
      "padding-right",
      "padding-bottom",
      "padding-left",
      "font-family",
      "font-size",
      "font-weight",
      "font-style",
      "line-height",
      "letter-spacing",
      "text-transform",
      "text-decoration",
      "text-align",
      "box-shadow",
      "cursor",
      "transition",
      "min-height",
      "min-width",
    ],
    // CSS custom property names to set on our button container
    cssCustomProperties: {
      "background-image": "--pd-theme-bg-image",
      "background-color": "--pd-theme-bg-color",
      color: "--pd-theme-text-color",
      "border-radius": "--pd-theme-border-radius",
      "border-width": "--pd-theme-border-width",
      "border-style": "--pd-theme-border-style",
      "border-color": "--pd-theme-border-color",
      outline: "--pd-theme-outline",
      "outline-offset": "--pd-theme-outline-offset",
      "padding-top": "--pd-theme-padding-top",
      "padding-right": "--pd-theme-padding-right",
      "padding-bottom": "--pd-theme-padding-bottom",
      "padding-left": "--pd-theme-padding-left",
      "font-family": "--pd-theme-font-family",
      "font-size": "--pd-theme-font-size",
      "font-weight": "--pd-theme-font-weight",
      "font-style": "--pd-theme-font-style",
      "line-height": "--pd-theme-line-height",
      "letter-spacing": "--pd-theme-letter-spacing",
      "text-transform": "--pd-theme-text-transform",
      "text-decoration": "--pd-theme-text-decoration",
      "text-align": "--pd-theme-text-align",
      "box-shadow": "--pd-theme-box-shadow",
      cursor: "--pd-theme-cursor",
      transition: "--pd-theme-transition",
      "min-height": "--pd-theme-min-height",
      "min-width": "--pd-theme-min-width",
    },
  };

  /**
   * Find the Add to Cart button in the document
   * @param {string} customSelector - Optional custom selector from block settings
   * @returns {Element|null} The Add to Cart button element or null
   */
  function findAddToCartButton(customSelector) {
    // First try custom selector if provided
    if (customSelector) {
      try {
        const customButton = document.querySelector(customSelector);
        if (customButton) {
          console.log(
            "[PD Theme Detector] Found button using custom selector:",
            customSelector,
          );
          return customButton;
        }
      } catch (e) {
        console.warn(
          "[PD Theme Detector] Invalid custom selector:",
          customSelector,
        );
      }
    }

    // Try auto-detection with common selectors
    for (const selector of CONFIG.autoDetectSelectors) {
      try {
        const button = document.querySelector(selector);
        if (button && isVisible(button)) {
          console.log(
            "[PD Theme Detector] Found button using selector:",
            selector,
          );
          return button;
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    console.warn(
      "[PD Theme Detector] Could not find Add to Cart button. Using default styles.",
    );
    return null;
  }

  /**
   * Check if an element is visible
   * @param {Element} element
   * @returns {boolean}
   */
  function isVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      element.offsetParent !== null
    );
  }

  /**
   * Get computed styles from an element
   * @param {Element} element
   * @returns {Object} Object with CSS property names and values
   */
  function getElementStyles(element) {
    const computedStyle = window.getComputedStyle(element);
    const styles = {};

    CONFIG.propertiesToCopy.forEach((prop) => {
      const value = computedStyle.getPropertyValue(prop);
      if (value && value !== "initial" && value !== "none") {
        styles[prop] = value;
      }
    });

    return styles;
  }

  /**
   * Get hover styles by analyzing stylesheets
   * @param {Element} element
   * @returns {Object} Object with hover CSS properties
   */
  function getHoverStyles(element) {
    const hoverStyles = {};

    try {
      const collectHoverStyles = (rules) => {
        if (!rules) return;

        for (const rule of rules) {
          if (rule.cssRules) {
            collectHoverStyles(rule.cssRules);
            continue;
          }

          // Check for :hover pseudo-class
          if (rule.selectorText && rule.selectorText.includes(":hover")) {
            // Check if this rule might apply to our element
            const selectors = rule.selectorText.split(",");
            for (const selector of selectors) {
              const cleanSelector = selector.replace(/:hover/g, "").trim();
              if (!cleanSelector) continue;

              try {
                if (
                  element.matches(cleanSelector) ||
                  element.closest(cleanSelector)
                ) {
                  // Extract styles from this rule
                  const style = rule.style;
                  for (let i = 0; i < style.length; i++) {
                    const prop = style[i];
                    const value = style.getPropertyValue(prop);
                    if (value) {
                      hoverStyles[prop] = value;
                    }
                  }
                }
              } catch (e) {
                // Invalid selector, skip
              }
            }
          }
        }
      };

      for (const sheet of document.styleSheets) {
        try {
          const rules = sheet.cssRules || sheet.rules;
          collectHoverStyles(rules);
        } catch (e) {
          // Cross-origin stylesheet, skip
        }
      }
    } catch (e) {
      console.warn("[PD Theme Detector] Error reading stylesheets:", e);
    }

    return hoverStyles;
  }

  /**
   * Apply styles as CSS custom properties to the root element
   * @param {Element} rootElement - The root element to set properties on
   * @param {Object} styles - Object with CSS property names and values
   * @param {string} prefix - Prefix for custom property names
   */
  function applyStylesAsCustomProperties(rootElement, styles, prefix = "") {
    Object.keys(styles).forEach((prop) => {
      const customPropName = CONFIG.cssCustomProperties[prop];
      if (customPropName) {
        rootElement.style.setProperty(customPropName, styles[prop]);
      }
    });
  }

  /**
   * Copy theme button classes to personalize button
   * @param {Element} addToCartButton
   * @param {Element} rootElement
   */
  function applyThemeClasses(addToCartButton, rootElement) {
    const className = addToCartButton.getAttribute("class") || "";
    const classNames = className.split(/\s+/).filter(Boolean);
    if (classNames.length === 0) {
      return;
    }

    const applyToButton = (button) => {
      if (!button || button.dataset.pdThemeClassesApplied === "true") {
        return true;
      }

      classNames.forEach((name) => {
        if (name && name !== "pd-personalize-button") {
          button.classList.add(name);
        }
      });

      button.classList.add("pd-theme-classes-applied");
      button.dataset.pdThemeClassesApplied = "true";
      return true;
    };

    const existingButton = rootElement.querySelector(".pd-personalize-button");
    if (existingButton && applyToButton(existingButton)) {
      return;
    }

    const observer = new MutationObserver(() => {
      const button = rootElement.querySelector(".pd-personalize-button");
      if (button && applyToButton(button)) {
        observer.disconnect();
      }
    });

    observer.observe(rootElement, { childList: true, subtree: true });
  }

  /**
   * Initialize the theme style detector
   */
  function init() {
    // Find our root element
    const rootElement = document.getElementById("pd-stepper-root");
    if (!rootElement) {
      console.log("[PD Theme Detector] Root element not found, skipping");
      return;
    }

    // Check if theme style is enabled
    const useThemeStyle = rootElement.dataset.useThemeStyle !== "false";
    if (!useThemeStyle) {
      console.log(
        "[PD Theme Detector] Theme style disabled, using custom styles",
      );
      return;
    }

    // Get custom selector from data attribute
    const customSelector = rootElement.dataset.customButtonSelector;

    // Find the Add to Cart button
    const addToCartButton = findAddToCartButton(customSelector);
    if (!addToCartButton) {
      console.log(
        "[PD Theme Detector] No Add to Cart button found, using defaults",
      );
      return;
    }

    // Get normal styles
    const normalStyles = getElementStyles(addToCartButton);
    console.log("[PD Theme Detector] Copied normal styles:", normalStyles);

    // Get hover styles
    const hoverStyles = getHoverStyles(addToCartButton);
    console.log("[PD Theme Detector] Copied hover styles:", hoverStyles);

    // Apply normal styles
    applyStylesAsCustomProperties(rootElement, normalStyles);

    // Apply theme button classes for better parity (pseudo elements, etc.)
    applyThemeClasses(addToCartButton, rootElement);

    // Apply hover styles with hover prefix
    Object.keys(hoverStyles).forEach((prop) => {
      const customPropName = CONFIG.cssCustomProperties[prop];
      if (customPropName) {
        rootElement.style.setProperty(
          customPropName + "-hover",
          hoverStyles[prop],
        );
      }
    });

    // If no hover styles were found, sample computed hover styles on interaction
    if (Object.keys(hoverStyles).length === 0) {
      const sampleHoverStyles = () => {
        const hoveredStyles = getElementStyles(addToCartButton);
        Object.keys(hoveredStyles).forEach((prop) => {
          const customPropName = CONFIG.cssCustomProperties[prop];
          if (customPropName) {
            rootElement.style.setProperty(
              customPropName + "-hover",
              hoveredStyles[prop],
            );
          }
        });
        rootElement.classList.add("pd-theme-hover-sampled");
        console.log("[PD Theme Detector] Sampled hover styles on interaction");
      };

      addToCartButton.addEventListener("mouseenter", sampleHoverStyles, {
        once: true,
      });
      addToCartButton.addEventListener("focus", sampleHoverStyles, {
        once: true,
      });
      addToCartButton.addEventListener("touchstart", sampleHoverStyles, {
        once: true,
        passive: true,
      });
    }

    // Add a class to indicate theme styles have been applied
    rootElement.classList.add("pd-theme-styles-applied");

    console.log("[PD Theme Detector] Theme styles applied successfully");
  }

  // Run when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    // DOM already loaded, run immediately
    init();
  }

  // Also run when Shopify section loads (for theme editor)
  if (window.Shopify && window.Shopify.designMode) {
    document.addEventListener("shopify:section:load", function (event) {
      if (event.target.querySelector("#pd-stepper-root")) {
        setTimeout(init, 100);
      }
    });
  }
})();
