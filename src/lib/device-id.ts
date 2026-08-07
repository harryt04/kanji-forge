/** A stable per-browser device id, used to attribute reviews/outbox rows to a device. */
const STORAGE_KEY = 'kanjiforge-device-id';

export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(STORAGE_KEY, created);
  return created;
}
