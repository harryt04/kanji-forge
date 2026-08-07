/**
 * src/lib/ is reserved for framework-agnostic, cross-cutting helpers only.
 * It is NOT a dumping ground for feature or domain state. Real per-domain Zustand stores
 * (study queue, settings, theme, etc.) belong under their owning src/features/ directory.
 *
 * This file is an example placeholder showing Zustand wiring pattern.
 * TODO(T1.1): Implement real stores for study queue, settings, theme, etc. under src/features/
 */

import { create } from 'zustand'

interface UIStore {
  theme: 'light' | 'dark' | 'auto'
  setTheme: (theme: 'light' | 'dark' | 'auto') => void
}

export const useUIStore = create<UIStore>((set) => ({
  theme: 'auto',
  setTheme: (theme) => set({ theme }),
}))
