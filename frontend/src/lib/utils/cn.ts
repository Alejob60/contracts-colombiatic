import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind CSS classes with conflict resolution.
 *
 * WHY twMerge + clsx: clsx handles conditional classes and array inputs,
 * while twMerge resolves Tailwind conflicts (e.g., "p-4 p-2" → "p-2").
 * Using only clsx would leave conflicting utilities in the output.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
