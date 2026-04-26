import { apiRequest } from "@/services/api/client";
import type {
  AuthPayload,
  AuthTokens,
  CheckHotelResponse,
  CreateUserPayload,
  EnrichResponse,
  HotelSearchResponse,
  ListSavedHotelsResponse,
  LoginPayload,
  PlanResponse,
  PlannedRoute,
  RegisterPayload,
  SavedHotel,
  SpotResult,
  Trip,
  UpdateUserPayload,
  UserProfile,
  RealtimeWeatherResponse,
} from "@/services/api/types";

export const authService = {
  register(payload: RegisterPayload) {
    return apiRequest<AuthPayload>("/api/bff/auth/register", {
      method: "POST",
      body: payload,
    });
  },

  login(payload: LoginPayload) {
    return apiRequest<AuthPayload>("/api/bff/auth/login", {
      method: "POST",
      body: payload,
    });
  },

  me(accessToken: string) {
    return apiRequest<{ user: UserProfile }>("/api/bff/auth/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },

  refresh(refreshToken: string) {
    return apiRequest<AuthTokens>("/api/bff/auth/refresh", {
      method: "POST",
      body: { refresh_token: refreshToken },
    });
  },

  logout(accessToken?: string, refreshToken?: string) {
    const headers: HeadersInit = accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : {};

    return apiRequest<{ ok: boolean; revoked: boolean }>("/api/bff/auth/logout", {
      method: "POST",
      headers,
      body: { refresh_token: refreshToken ?? null },
    });
  },
};

export const usersService = {
  listUsers() {
    return apiRequest<{ user_ids: string[]; count: number }>("/api/bff/users");
  },

  create(payload: CreateUserPayload) {
    return apiRequest<UserProfile>("/api/bff/users", {
      method: "POST",
      body: payload,
    });
  },

  get(userId: string) {
    return apiRequest<UserProfile>(`/api/bff/users/${encodeURIComponent(userId)}`);
  },

  update(userId: string, payload: UpdateUserPayload) {
    return apiRequest<UserProfile>(`/api/bff/users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      body: payload,
    });
  },
};

export const tripsService = {
  listUserTripIds(userId: string) {
    return apiRequest<{ user_id: string; trip_ids: string[] }>(
      `/api/bff/trips/users/${encodeURIComponent(userId)}/trips`
    );
  },

  getTrip(tripId: string) {
    return apiRequest<Trip>(`/api/bff/trips/trips/${encodeURIComponent(tripId)}`);
  },

  createTrip(payload: { user_id: string; trip_date: string; chosen_route: unknown }) {
    return apiRequest<Trip>("/api/bff/trips/trips", {
      method: "POST",
      body: payload,
    });
  },
};

export const agentService = {
  search(payload: { query: string; user_id?: string; tags?: string[] }) {
    return apiRequest<SpotResult>("/api/bff/agent/search", {
      method: "POST",
      body: payload,
    });
  },

  plan(payload: SpotResult) {
    return apiRequest<PlanResponse>("/api/bff/agent/plan", {
      method: "POST",
      body: payload,
    });
  },

  enrich(recommendedRoutes: PlannedRoute[]) {
    return apiRequest<EnrichResponse>("/api/bff/agent/enrich", {
      method: "POST",
      body: { recommended_routes: recommendedRoutes },
    });
  },

  listSavedHotels() {
    return apiRequest<ListSavedHotelsResponse>("/api/bff/agent/api/saved-hotels");
  },

  saveHotel(payload: {
    display_name: string;
    address?: string;
    lat?: number;
    lng?: number;
    license_number?: string;
    source?: string;
    source_url?: string;
    hotel_id?: string;
  }) {
    return apiRequest<{ saved: boolean; created: boolean; id: number }>("/api/bff/agent/api/save-hotel", {
      method: "POST",
      body: payload,
    });
  },

  checkHotel(params: {
    name?: string;
    name_en?: string;
    license_number?: string;
    lat?: number;
    lng?: number;
    source?: string;
  }) {
    return apiRequest<CheckHotelResponse>("/api/bff/agent/api/check-hotel", {
      query: params,
    });
  },

  searchHotels(payload: {
    query: string;
    location?: string;
    tags?: string[];
    top_k?: number;
  }) {
    return apiRequest<HotelSearchResponse>("/api/bff/agent/api/search-hotels", {
      method: "POST",
      body: payload,
    });
  },

  listHiddenSpots() {
    return apiRequest<Array<{ google_place_id: string; name: string; category?: string }>>(
      "/api/bff/agent/hidden-spots"
    );
  },
};

export const realtimeService = {
  getWeather(lat: number, lng: number) {
    return apiRequest<RealtimeWeatherResponse>("/api/bff/realtime/weather", {
      query: { lat, lng },
    });
  },

  getMrt(lat: number, lng: number) {
    return apiRequest<{ arrivals: unknown[]; count: number; cached: boolean }>("/api/bff/realtime/mrt", {
      query: { lat, lng },
    });
  },

  getBus(lat: number, lng: number) {
    return apiRequest<{ arrivals: unknown[]; count: number; cached: boolean }>("/api/bff/realtime/bus", {
      query: { lat, lng },
    });
  },

  getUbike(lat: number, lng: number) {
    return apiRequest<{ stations: unknown[]; count: number; cached: boolean }>("/api/bff/realtime/ubike", {
      query: { lat, lng },
    });
  },
};

export function dedupeSavedHotels(hotels: SavedHotel[]): SavedHotel[] {
  const seen = new Set<string>();
  return hotels.filter((hotel) => {
    const key = `${hotel.source}::${hotel.source_url ?? hotel.display_name}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
