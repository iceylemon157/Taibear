export type DirectionsTravelMode = "TRANSIT" | "WALKING" | "DRIVING";

type DirectionPoint = {
  name?: string;
  location?: { lat?: number; lng?: number };
};

function toTravelModeParam(mode: DirectionsTravelMode): string {
  if (mode === "WALKING") {
    return "walking";
  }
  if (mode === "DRIVING") {
    return "driving";
  }
  return "transit";
}

function toPointParam(point: DirectionPoint): string {
  const lat = point.location?.lat;
  const lng = point.location?.lng;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `${lat},${lng}`;
  }
  return encodeURIComponent(point.name || "");
}

export function buildGoogleMapsDirectionsUrl(points: DirectionPoint[], mode: DirectionsTravelMode = "TRANSIT"): string {
  if (points.length < 2) {
    return "";
  }

  const origin = toPointParam(points[0]);
  const destination = toPointParam(points[points.length - 1]);

  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=${toTravelModeParam(mode)}`;

  if (points.length > 2) {
    const middle = points.slice(1, -1).map(toPointParam).join("|");
    if (middle) {
      url += `&waypoints=${middle}`;
    }
  }

  return url;
}
