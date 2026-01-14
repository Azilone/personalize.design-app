/**
 * Prompt variable parsing and validation utilities.
 *
 * Prompt variables use the format {{variable_name}} within template prompts.
 * This module provides utilities to extract references and validate them
 * against a set of defined variable names.
 */

export type PromptVariableValidationResult =
  | { valid: true }
  | { valid: false; errors: string[] };

/**
 * Extracts all {{variable_name}} references from a prompt string.
 * Returns unique variable names, trimmed of whitespace.
 *
 * @example
 * extractPromptVariableReferences("A {{animal}} in {{color}}")
 * // returns ["animal", "color"]
 */
export const extractPromptVariableReferences = (prompt: string): string[] => {
  const regex = /\{\{\s*([^}\s]+)\s*\}\}/g;
  const matches = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = regex.exec(prompt)) !== null) {
    const varName = match[1].trim();
    if (varName) {
      matches.add(varName);
    }
  }

  return Array.from(matches);
};

/**
 * Validates that all prompt variable references match defined variables.
 *
 * Returns an object with `valid: true` if all references are valid,
 * or `valid: false` with an array of error messages otherwise.
 */
export const validatePromptVariableReferences = (
  prompt: string,
  definedVariables: string[],
): PromptVariableValidationResult => {
  const references = extractPromptVariableReferences(prompt);
  const definedSet = new Set(definedVariables);
  const errors: string[] = [];

  for (const ref of references) {
    if (!definedSet.has(ref)) {
      errors.push(`Variable "{{${ref}}}" is referenced but not defined.`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
};

export type VariableNameValidationResult =
  | { valid: true }
  | { valid: false; errors: string[] };

/**
 * Validates a list of variable names.
 * - Names must be non-empty strings (after trimming).
 * - Names must be unique within the list.
 * - Names must be <= 50 characters.
 * - Names must contain only alphanumeric characters and underscores.
 *
 * Returns an object with `valid: true` if all names are valid,
 * or `valid: false` with an array of error messages otherwise.
 */
export const validateVariableNames = (
  names: string[],
): VariableNameValidationResult => {
  const errors: string[] = [];
  const seen = new Set<string>();

  if (names.length > 50) {
    errors.push(`Cannot add more than 50 variables.`);
    return { valid: false, errors };
  }

  for (let i = 0; i < names.length; i++) {
    const name = names[i].trim();

    if (!name) {
      errors.push(`Variable at position ${i + 1} cannot be empty.`);
      continue;
    }

    if (name.length > 50) {
      errors.push(
        `Variable "${name}" exceeds maximum length of 50 characters.`,
      );
      continue;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      errors.push(
        `Variable "${name}" can only contain letters, numbers, and underscores.`,
      );
      continue;
    }

    if (seen.has(name)) {
      errors.push(`Variable "${name}" is defined more than once.`);
    } else {
      seen.add(name);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
};
