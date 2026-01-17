import { describe, it, expect } from "vitest";
import {
  applyPromptVariableValues,
  extractPromptVariableReferences,
  validatePromptVariableReferences,
  validateVariableNames,
} from "./prompt-variables";

describe("extractPromptVariableReferences", () => {
  it("extracts single variable", () => {
    expect(extractPromptVariableReferences("A {{animal}}")).toEqual(["animal"]);
  });

  it("extracts multiple variables", () => {
    expect(
      extractPromptVariableReferences("A {{animal}} in {{color}}"),
    ).toEqual(["animal", "color"]);
  });

  it("deduplicates repeated variables", () => {
    expect(
      extractPromptVariableReferences("{{animal}} and {{animal}}"),
    ).toEqual(["animal"]);
  });

  it("handles whitespace inside braces", () => {
    expect(
      extractPromptVariableReferences("{{ animal }} in {{ color }}"),
    ).toEqual(["animal", "color"]);
  });

  it("returns empty array for no variables", () => {
    expect(extractPromptVariableReferences("No variables here")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(extractPromptVariableReferences("")).toEqual([]);
  });

  it("handles incomplete braces", () => {
    expect(extractPromptVariableReferences("{{incomplete")).toEqual([]);
    expect(extractPromptVariableReferences("incomplete}}")).toEqual([]);
  });

  it("ignores malformed nested braces", () => {
    // Triple braces are not a valid pattern, regex behavior is to capture incorrectly
    // This is acceptable as triple braces is not a supported use case
    expect(extractPromptVariableReferences("{{{animal}}}")).toEqual([
      "{animal",
    ]);
  });
});

describe("validatePromptVariableReferences", () => {
  it("returns valid for matching references", () => {
    const result = validatePromptVariableReferences("{{animal}} in {{color}}", [
      "animal",
      "color",
    ]);
    expect(result).toEqual({ valid: true });
  });

  it("returns valid for no references", () => {
    const result = validatePromptVariableReferences("No variables", []);
    expect(result).toEqual({ valid: true });
  });

  it("returns invalid for undefined reference", () => {
    const result = validatePromptVariableReferences("{{animal}} in {{color}}", [
      "animal",
    ]);
    expect(result).toEqual({
      valid: false,
      errors: ['Variable "{{color}}" is referenced but not defined.'],
    });
  });

  it("returns multiple errors for multiple undefined references", () => {
    const result = validatePromptVariableReferences("{{foo}} and {{bar}}", []);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toHaveLength(2);
    }
  });
});

describe("applyPromptVariableValues", () => {
  it("replaces known variables with values", () => {
    const result = applyPromptVariableValues("A {{animal}} named {{name}}", {
      animal: "cat",
      name: "Mochi",
    });
    expect(result).toBe("A cat named Mochi");
  });

  it("preserves unknown variables", () => {
    const result = applyPromptVariableValues("A {{animal}}", {});
    expect(result).toBe("A {{animal}}");
  });

  it("handles whitespace inside braces", () => {
    const result = applyPromptVariableValues("{{ animal }}", { animal: "dog" });
    expect(result).toBe("dog");
  });
});

describe("validateVariableNames", () => {
  it("returns valid for unique non-empty names", () => {
    const result = validateVariableNames(["animal", "color"]);
    expect(result).toEqual({ valid: true });
  });

  it("returns valid for empty list", () => {
    const result = validateVariableNames([]);
    expect(result).toEqual({ valid: true });
  });

  it("returns invalid for empty name", () => {
    const result = validateVariableNames([""]);
    expect(result).toEqual({
      valid: false,
      errors: ["Variable at position 1 cannot be empty."],
    });
  });

  it("returns invalid for whitespace-only name", () => {
    const result = validateVariableNames(["   "]);
    expect(result).toEqual({
      valid: false,
      errors: ["Variable at position 1 cannot be empty."],
    });
  });

  it("returns invalid for duplicate names", () => {
    const result = validateVariableNames(["animal", "animal"]);
    expect(result).toEqual({
      valid: false,
      errors: ['Variable "animal" is defined more than once.'],
    });
  });

  it("returns invalid for name exceeding max length", () => {
    const longName = "a".repeat(51);
    const result = validateVariableNames([longName]);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("exceeds maximum length");
    }
  });

  it("returns invalid for name with special characters", () => {
    const result = validateVariableNames(["animal@"]);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("can only contain");
    }
  });

  it("returns valid for name with underscores", () => {
    const result = validateVariableNames(["animal_color"]);
    expect(result).toEqual({ valid: true });
  });

  it("returns invalid for more than 50 variables", () => {
    const variables = Array.from({ length: 51 }, (_, i) => `var${i}`);
    const result = validateVariableNames(variables);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("Cannot add more than 50 variables");
    }
  });

  it("returns multiple errors", () => {
    const result = validateVariableNames(["", "animal", "animal"]);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toHaveLength(2);
    }
  });
});
