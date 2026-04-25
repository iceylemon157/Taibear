const CURRENT_TRIP_STORAGE_KEY = "taibear.current-trip-map";

type CurrentTripMap = Record<string, string>;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readMap(): CurrentTripMap {
  if (!isBrowser()) {
    return {};
  }

  const raw = window.localStorage.getItem(CURRENT_TRIP_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as CurrentTripMap;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function writeMap(map: CurrentTripMap): void {
  if (!isBrowser()) {
    return;
  }
  window.localStorage.setItem(CURRENT_TRIP_STORAGE_KEY, JSON.stringify(map));
}

export function getCurrentTripId(userId: string): string | null {
  if (!userId) {
    return null;
  }
  const map = readMap();
  return map[userId] || null;
}

export function setCurrentTripId(userId: string, tripId: string): void {
  if (!userId || !tripId) {
    return;
  }
  const map = readMap();
  map[userId] = tripId;
  writeMap(map);
}

export function clearCurrentTripId(userId: string): void {
  if (!userId) {
    return;
  }
  const map = readMap();
  if (!(userId in map)) {
    return;
  }
  delete map[userId];
  writeMap(map);
}
