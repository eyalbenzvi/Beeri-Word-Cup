// Singleton in-memory cache + the dispatch + subscription primitives that
// drive React re-renders.
//
// What lives here:
//   * The `cache` object — every domain's last-known snapshot, keyed by
//     CacheShape.
//   * `notifyAndEmit` / `emitSaving` / `emitSaved` / `emitWriteError` —
//     thin wrappers around `window.dispatchEvent` so consumers (saving
//     indicators, error banners) can listen via plain DOM events.
//   * `subscribe` / `subscribeToKey` — `useSyncExternalStore`-friendly
//     subscription primitives that re-fire when any (or a specific) key
//     mutates.
//   * `isStoreReady` / `getMissingReadyKeys` — readiness gate for the
//     splash screen.
//   * `BroadcastChannel` cross-tab notifier for the active form id.
//
// Has no dependencies on any other store module — every other module
// reads/writes `cache` through the helpers exported here.

const STORE_UPDATED_EVENT = "store-updated";

type Listener = () => void;

export type CacheShape = {
  users: Record<string, any>;
  userDirectory: Record<string, any>;
  userPrivate: Record<string, any>;
  predictions: Record<string, any>;
  matchResults: Record<string, any>;
  actualAdvancing: Record<string, any>;
  actualBonuses: any;
  settings: Record<string, any>;
  // True once we've seen a SERVER (non-offline-cache) settings snapshot, or a
  // fresh HTTP fetch of the public settings endpoint, or the readiness
  // watchdog forced it. Distinct from `_ready.settings` (which flips on the
  // first snapshot of ANY kind, including a possibly-stale offline cache read)
  // so consumers that must not act on stale `predictionsLocked` — namely the
  // Leaderboard lock screen — can wait for server confirmation WITHOUT
  // blocking the global readiness gate / trapping offline users on a spinner.
  settingsServerConfirmed: boolean;
  summaries: Record<string, any>;
  _ready: Record<string, boolean>;
};

export const cache: CacheShape = {
  users: {},
  // {uid: {displayName, firstName?, lastName?}} — auth-readable directory.
  userDirectory: {},
  // {uid: {email, isAdmin, profileCompleted, lastLoginAt, createdAt, ...}}
  // For non-admin users: own record only (rules permit owner-read only).
  // For admin users: still own record only on the listener side; admin tabs
  // continue to read legacy `users` for the full membership during the
  // compat window.
  userPrivate: {},
  predictions: {}, // formId -> formData (assembled from individual docs)
  matchResults: {},
  actualAdvancing: {},
  actualBonuses: { champion: null, topScorers: [] },
  settings: { predictionsLocked: false, bestCaseEnabled: false },
  settingsServerConfirmed: false,
  summaries: {}, // summaryId -> summaryData
  _ready: {},
};

// ============ EMIT HELPERS ============

export function notifyAndEmit(key: string) {
  window.dispatchEvent(new CustomEvent(STORE_UPDATED_EVENT, { detail: { key } }));
}
export function emitSaving(key: string) {
  window.dispatchEvent(new CustomEvent("store-saving", { detail: { key } }));
}
export function emitSaved(key: string) {
  window.dispatchEvent(new CustomEvent("store-saved", { detail: { key } }));
}
export function emitWriteError(key: string, error: any) {
  window.dispatchEvent(
    new CustomEvent("store-write-error", {
      detail: { key, error: error?.message || String(error) },
    }),
  );
}

// ============ READY GATE ============
//
// Set of keys that must all be ready before isStoreReady() returns true.
// Mirrors the keys populated by the initial gameDoc + predictions
// listeners. Listeners.ts can extend this if new top-level data sources
// gain readiness gates.
const REQUIRED_READY_KEYS = new Set<string>([
  "users",
  "userDirectory",
  "matchResults",
  "actualAdvancing",
  "actualBonuses",
  "settings",
  "predictions",
]);

export function isStoreReady() {
  for (const k of REQUIRED_READY_KEYS) {
    if (!cache._ready[k]) return false;
  }
  return true;
}

export function getMissingReadyKeys() {
  const missing: string[] = [];
  for (const k of REQUIRED_READY_KEYS) {
    if (!cache._ready[k]) missing.push(k);
  }
  return missing;
}

// ============ SUBSCRIPTIONS ============

const listeners = new Set<Listener>();
const keyedListeners = new Map<string, Set<Listener>>();

export function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Subscribe only to changes for a specific key (e.g., "predictions", "users")
export function subscribeToKey(key: string, listener: Listener) {
  if (!keyedListeners.has(key)) keyedListeners.set(key, new Set());
  keyedListeners.get(key)!.add(listener);
  return () => {
    const set = keyedListeners.get(key);
    if (set) {
      set.delete(listener);
      if (set.size === 0) keyedListeners.delete(key);
    }
  };
}

function notifyListeners(event?: any) {
  for (const listener of listeners) listener();
  // Also notify keyed listeners
  const key = event?.detail?.key;
  if (key && keyedListeners.has(key)) {
    for (const listener of keyedListeners.get(key)!) listener();
  }
}

// Manual fan-out for callers that have just mutated multiple cache slices
// at once (e.g. deleteUser drops user + forms). Triggers the global
// listeners only — keyed subscribers get notified via subsequent
// notifyAndEmit(key) calls.
export function notifyAllListeners() {
  for (const listener of listeners) listener();
}

// Registered once at module load — notifyListeners dispatched via notifyAndEmit
if (!(window as any).__storeListenerRegistered) {
  (window as any).__storeListenerRegistered = true;
  window.addEventListener(STORE_UPDATED_EVENT, notifyListeners as EventListener);
}

// ============ CROSS-TAB SYNC ============
//
// notify other tabs when the active form changes. Other modules call
// `openBroadcastChannel()` after listener init; logout closes the
// channel so a stale receiver in a closed session can't fire spurious
// notifications.

let broadcastChannel: BroadcastChannel | null = null;

export function openBroadcastChannel() {
  if (broadcastChannel) return; // already open
  try {
    broadcastChannel = new BroadcastChannel("beeri-wc-sync");
    broadcastChannel.onmessage = (event) => {
      if (event.data?.type === "activeForm-changed") {
        // Another tab changed the active form — re-read from localStorage
        notifyAndEmit("activeForm");
      }
    };
  } catch {
    // BroadcastChannel not supported — graceful fallback (no cross-tab sync)
  }
}

export function closeBroadcastChannel() {
  try { broadcastChannel?.close(); } catch { /* already closed */ }
  broadcastChannel = null;
}

// Active form is broadcast via this helper so every cross-tab callsite
// goes through one path.
export function broadcastActiveFormChange() {
  try { broadcastChannel?.postMessage({ type: "activeForm-changed" }); } catch { /* noop */ }
}

openBroadcastChannel();
