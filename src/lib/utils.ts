/**
 * src/lib/ is reserved for framework-agnostic, cross-cutting helpers only (e.g. the cn() utility).
 * It is NOT a dumping ground for feature or domain state. Real per-domain Zustand stores
 * (study queue, settings, theme, etc.) belong under their owning src/features/ directory.
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
