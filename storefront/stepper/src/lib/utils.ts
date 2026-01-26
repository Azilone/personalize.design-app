import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatVariableLabel(name: string): string {
  const withSpaces = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!withSpaces) {
    return name;
  }
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}
