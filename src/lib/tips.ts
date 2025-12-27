export const TIPS_ENABLED_STORAGE_KEY = 'isocity-tips-enabled';
export const TIPS_SHOWN_STORAGE_KEY = 'isocity-tips-shown';
export const TIPS_LAST_SHOWN_AT_STORAGE_KEY = 'isocity-tips-last-shown-at';

const TIPS_ENABLED_EVENT = 'isocity-tips-enabled-changed';

export function getTipsEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(TIPS_ENABLED_STORAGE_KEY);
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

export function setTipsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TIPS_ENABLED_STORAGE_KEY, enabled ? 'true' : 'false');
    window.dispatchEvent(new Event(TIPS_ENABLED_EVENT));
  } catch {
    // ignore
  }
}

export function onTipsEnabledChange(cb: (enabled: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = () => cb(getTipsEnabled());
  window.addEventListener(TIPS_ENABLED_EVENT, handler);

  // Also respond to storage updates from other tabs.
  const storageHandler = (e: StorageEvent) => {
    if (e.key === TIPS_ENABLED_STORAGE_KEY) handler();
  };
  window.addEventListener('storage', storageHandler);

  return () => {
    window.removeEventListener(TIPS_ENABLED_EVENT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}

export type TipsShownMap = Record<string, true>;

export function getTipsShown(): TipsShownMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(TIPS_SHOWN_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as TipsShownMap;
  } catch {
    return {};
  }
}

export function markTipShown(tipId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const shown = getTipsShown();
    shown[tipId] = true;
    window.localStorage.setItem(TIPS_SHOWN_STORAGE_KEY, JSON.stringify(shown));
  } catch {
    // ignore
  }
}

export function getTipsLastShownAt(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(TIPS_LAST_SHOWN_AT_STORAGE_KEY);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function setTipsLastShownAt(timestampMs: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TIPS_LAST_SHOWN_AT_STORAGE_KEY, String(timestampMs));
  } catch {
    // ignore
  }
}

