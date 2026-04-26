import type { Trip, TripStop } from "@/services/api/types";

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

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getOrderedStops(stops: TripStop[]): TripStop[] {
  return [...stops].sort((a, b) => a.step_order - b.step_order);
}

export function getHiddenSpot(trip: Pick<Trip, "trip_id" | "stops"> | null | undefined): TripStop | null {
  if (!trip || trip.stops.length === 0) {
    return null;
  }

  const orderedStops = getOrderedStops(trip.stops);
  // Deterministic pseudo-random pick so every trip always has one stable hidden spot.
  const hiddenIndex = hashSeed(`${trip.trip_id}:${orderedStops.length}`) % orderedStops.length;
  return orderedStops[hiddenIndex] ?? null;
}
