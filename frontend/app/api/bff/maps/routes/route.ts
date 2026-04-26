import { NextRequest, NextResponse } from "next/server";

type LatLng = { lat: number; lng: number };

type TravelMode = "TRANSIT" | "WALKING" | "DRIVING";

type ComputeRouteBody = {
  origin?: LatLng;
  destination?: LatLng;
  travelMode?: TravelMode;
  intermediates?: LatLng[];
};

type CachedRoute = {
  path: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
  expiresAt: number;
};

const ROUTES_ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";
const CACHE_TTL_MS = 10 * 60 * 1000;
const routeCache = new Map<string, CachedRoute>();

function readMapsApiKey(): string {
  return process.env.GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
}

function isFiniteCoordinate(point: LatLng | undefined): point is LatLng {
  if (!point) {
    return false;
  }
  return Number.isFinite(point.lat) && Number.isFinite(point.lng);
}

function toGoogleTravelMode(mode: TravelMode): "TRANSIT" | "WALK" | "DRIVE" {
  if (mode === "WALKING") {
    return "WALK";
  }
  if (mode === "DRIVING") {
    return "DRIVE";
  }
  return "TRANSIT";
}

function buildCacheKey(payload: Required<ComputeRouteBody>): string {
  const points = [payload.origin, ...(payload.intermediates ?? []), payload.destination]
    .map((point) => `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`)
    .join("|");
  return `${payload.travelMode}:${points}`;
}

function parseDurationSeconds(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const numeric = value.endsWith("s") ? value.slice(0, -1) : value;
    const parsed = Number(numeric);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function decodePolyline(encoded: string): LatLng[] {
  function decodeValue(): number {
    let result = 0;
    let shift = 0;

    while (index < encoded.length) {
      const byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
      if (byte < 0x20) {
        break;
      }
    }

    return result & 1 ? ~(result >> 1) : result >> 1;
  }

  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    lat += decodeValue();
    lng += decodeValue();

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

export async function POST(request: NextRequest) {
  const apiKey = readMapsApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { detail: "Missing GOOGLE_MAPS_API_KEY (or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)." },
      { status: 500 }
    );
  }

  const rawBody = await request.json().catch(() => null) as ComputeRouteBody | null;
  const origin = rawBody?.origin;
  const destination = rawBody?.destination;
  const travelMode = rawBody?.travelMode ?? "TRANSIT";
  const intermediates = (rawBody?.intermediates ?? []).filter(isFiniteCoordinate);

  if (!isFiniteCoordinate(origin) || !isFiniteCoordinate(destination)) {
    return NextResponse.json({ detail: "Invalid origin or destination coordinates." }, { status: 422 });
  }

  if (!["TRANSIT", "WALKING", "DRIVING"].includes(travelMode)) {
    return NextResponse.json({ detail: "Unsupported travel mode." }, { status: 422 });
  }

  if (intermediates.length > 23) {
    return NextResponse.json({ detail: "Too many intermediates. Maximum is 23." }, { status: 422 });
  }

  const normalizedPayload: Required<ComputeRouteBody> = {
    origin,
    destination,
    travelMode,
    intermediates,
  };

  const cacheKey = buildCacheKey(normalizedPayload);
  const now = Date.now();
  const cached = routeCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json({
      path: cached.path,
      distanceMeters: cached.distanceMeters,
      durationSeconds: cached.durationSeconds,
      cached: true,
    });
  }

  const routeRequestBody = {
    origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
    destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
    intermediates: intermediates.map((point) => ({
      location: { latLng: { latitude: point.lat, longitude: point.lng } },
    })),
    travelMode: toGoogleTravelMode(travelMode),
    routingPreference: travelMode === "DRIVING" ? "TRAFFIC_AWARE" : undefined,
    computeAlternativeRoutes: false,
    languageCode: "zh-TW",
    units: "METRIC",
    polylineQuality: "HIGH_QUALITY",
  };

  try {
    const response = await fetch(ROUTES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify(routeRequestBody),
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail =
        typeof payload?.error?.message === "string" && payload.error.message.length > 0
          ? payload.error.message
          : "Failed to compute route.";
      return NextResponse.json({ detail }, { status: response.status });
    }

    const firstRoute = Array.isArray(payload?.routes) ? payload.routes[0] : null;
    const encodedPolyline = firstRoute?.polyline?.encodedPolyline;
    if (typeof encodedPolyline !== "string" || encodedPolyline.length === 0) {
      return NextResponse.json({ detail: "No route polyline returned." }, { status: 424 });
    }

    const path = decodePolyline(encodedPolyline);
    const distanceMeters = Number(firstRoute?.distanceMeters) || 0;
    const durationSeconds = parseDurationSeconds(firstRoute?.duration);

    routeCache.set(cacheKey, {
      path,
      distanceMeters,
      durationSeconds,
      expiresAt: now + CACHE_TTL_MS,
    });

    return NextResponse.json({
      path,
      distanceMeters,
      durationSeconds,
      cached: false,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Failed to compute route.";
    return NextResponse.json({ detail }, { status: 502 });
  }
}
