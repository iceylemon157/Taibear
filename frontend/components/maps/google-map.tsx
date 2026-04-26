"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type MapTravelMode = "TRANSIT" | "WALKING" | "DRIVING";

export type MapMarker = {
  id: string;
  position: { lat: number; lng: number };
  title: string;
  label?: string;
  color?: string;
};

type MapSegment = {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  travelMode: MapTravelMode;
  color?: string;
};

type GoogleMapProps = {
  className?: string;
  center: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarker[];
  segment?: MapSegment | null;
  onMarkerClick?: (markerId: string) => void;
};

type GoogleMapsWindow = Window & {
  google?: {
    maps?: any;
  };
  gm_authFailure?: () => void;
};

let mapsApiPromise: Promise<any> | null = null;

async function fetchMapsApiKey(): Promise<string> {
  const response = await fetch("/api/bff/maps/key", { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof payload?.detail === "string" && payload.detail.length > 0
        ? payload.detail
        : "Failed to load Google Maps API key."
    );
  }
  if (!payload?.apiKey) {
    throw new Error("Google Maps API key is empty.");
  }
  return String(payload.apiKey);
}

function ensureGoogleMapsApi(): Promise<any> {
  if (mapsApiPromise) {
    return mapsApiPromise;
  }

  mapsApiPromise = new Promise((resolve, reject) => {
    const win = window as GoogleMapsWindow;
    if (win.google?.maps) {
      resolve(win.google.maps);
      return;
    }

    fetchMapsApiKey()
      .then((apiKey) => {
        const existingScript = document.querySelector<HTMLScriptElement>("script[data-google-maps]");
        if (existingScript) {
          existingScript.addEventListener("load", () => {
            const maps = (window as GoogleMapsWindow).google?.maps;
            if (maps) {
              resolve(maps);
            } else {
              reject(new Error("Google Maps script loaded, but API is unavailable."));
            }
          });
          existingScript.addEventListener("error", () => reject(new Error("Failed to load Google Maps script.")));
          return;
        }

        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
        script.async = true;
        script.defer = true;
        script.setAttribute("data-google-maps", "true");
        script.onload = () => {
          const maps = (window as GoogleMapsWindow).google?.maps;
          if (maps) {
            resolve(maps);
            return;
          }
          reject(new Error("Google Maps script loaded, but API is unavailable."));
        };
        script.onerror = () => reject(new Error("Failed to load Google Maps script."));
        document.head.appendChild(script);
      })
      .catch((error) => {
        mapsApiPromise = null;
        reject(error);
      });
  });

  return mapsApiPromise;
}

function buildBounds(maps: any, points: Array<{ lat: number; lng: number }>): any {
  const bounds = new maps.LatLngBounds();
  for (const point of points) {
    bounds.extend(point);
  }
  return bounds;
}

export function GoogleMap({
  className,
  center,
  zoom = 13,
  markers = [],
  segment = null,
  onMarkerClick,
}: GoogleMapProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerInstancesRef = useRef<any[]>([]);
  const polylineRef = useRef<any>(null);
  const directionsRendererRef = useRef<any>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const markerPoints = useMemo(() => markers.map((marker) => marker.position), [markers]);

  useEffect(() => {
    const eventName = "google-maps-auth-failure";
    const win = window as GoogleMapsWindow;
    win.gm_authFailure = () => {
      window.dispatchEvent(new Event(eventName));
    };

    const onAuthFailure = () => {
      setErrorMessage("Google Maps JS API 授權失敗，已切換備援地圖。請檢查 key 的網域限制與 API 啟用狀態。");
    };

    window.addEventListener(eventName, onAuthFailure);
    return () => {
      window.removeEventListener(eventName, onAuthFailure);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      try {
        const maps = await ensureGoogleMapsApi();
        if (cancelled || !mapRef.current) {
          return;
        }

        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new maps.Map(mapRef.current, {
            center,
            zoom,
            mapTypeControl: false,
            fullscreenControl: false,
            streetViewControl: false,
          });
        }

        setErrorMessage("");
      } catch (error) {
        if (cancelled) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : "Google Maps 載入失敗");
      }
    }

    void initMap();

    return () => {
      cancelled = true;
    };
  }, [center, zoom]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const maps = (window as GoogleMapsWindow).google?.maps;

    if (!map || !maps) {
      return;
    }

    for (const marker of markerInstancesRef.current) {
      marker.setMap(null);
    }
    markerInstancesRef.current = [];

    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    if (directionsRendererRef.current) {
      directionsRendererRef.current.setMap(null);
      directionsRendererRef.current = null;
    }

    for (const marker of markers) {
      const markerInstance = new maps.Marker({
        map,
        position: marker.position,
        title: marker.title,
        label: marker.label,
        icon: marker.color
          ? {
              path: maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: marker.color,
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            }
          : undefined,
      });
      if (onMarkerClick) {
        markerInstance.addListener("click", () => onMarkerClick(marker.id));
      }
      markerInstancesRef.current.push(markerInstance);
    }

    const pointsToFit = [...markerPoints];

    if (segment) {
      pointsToFit.push(segment.from, segment.to);
      const directionsService = new maps.DirectionsService();
      const directionsRenderer = new maps.DirectionsRenderer({
        map,
        suppressMarkers: true,
        polylineOptions: {
          strokeColor: segment.color || "#3abdff",
          strokeOpacity: 0.9,
          strokeWeight: 5,
        },
      });
      directionsRendererRef.current = directionsRenderer;

      directionsService
        .route({
          origin: segment.from,
          destination: segment.to,
          travelMode: maps.TravelMode[segment.travelMode],
        })
        .then((result: any) => {
          directionsRenderer.setDirections(result);
        })
        .catch(() => {
          directionsRenderer.setMap(null);
          directionsRendererRef.current = null;
          polylineRef.current = new maps.Polyline({
            path: [segment.from, segment.to],
            geodesic: true,
            strokeColor: segment.color || "#3abdff",
            strokeOpacity: 0.9,
            strokeWeight: 4,
            map,
          });
        });
    }

    if (pointsToFit.length >= 2) {
      const bounds = buildBounds(maps, pointsToFit);
      map.fitBounds(bounds, 48);
    } else {
      map.setCenter(center);
      map.setZoom(zoom);
    }
  }, [center, markerPoints, markers, onMarkerClick, segment, zoom]);

  if (errorMessage) {
    return (
      <div className={className} style={{ background: "#e9f0f4" }}>
        <div className="w-full h-full flex flex-col items-center justify-center px-4 text-center">
          <p className="text-[28px]">🗺️</p>
          <p className="text-[13px] font-semibold text-[#141414] mt-2">Google Maps 載入失敗</p>
          <p className="text-[11px] text-[#666] mt-1">{errorMessage}</p>
        </div>
      </div>
    );
  }

  return <div ref={mapRef} className={className} />;
}
