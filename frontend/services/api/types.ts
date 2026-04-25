export interface UserProfile {
  user_id: string;
  display_name: string;
  country: string;
  preferred_languages: string[];
  age: number;
  preferred_transportation: string[];
  selected_tags: string[];
  reels: Array<{ url: string; text_content: string; auto_tags?: string[] }>;
  combined_tags?: string[];
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  refresh_expires_in: number;
}

export interface AuthPayload {
  user: UserProfile;
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  refresh_expires_in: number;
}

export interface LoginPayload {
  user_id: string;
  password: string;
}

export interface RegisterPayload {
  user_id: string;
  password: string;
  display_name: string;
  country?: string;
  preferred_languages?: string[];
  age?: number;
  preferred_transportation?: string[];
  selected_tags?: string[];
}

export interface CreateUserPayload {
  user_id: string;
  display_name: string;
  country?: string;
  preferred_languages?: string[];
  age?: number;
  preferred_transportation?: string[];
  selected_tags?: string[];
}

export interface UpdateUserPayload {
  display_name?: string;
  country?: string;
  preferred_languages?: string[];
  age?: number;
  preferred_transportation?: string[];
  selected_tags?: string[];
}

export interface SpotResult {
  query: string;
  user_preference?: unknown;
  top_results: unknown[];
  [key: string]: unknown;
}

export interface PlannedRoute {
  route_id: string;
  route_name: string;
  theme: string;
  google_maps_url: string;
  tsp_evaluation: {
    total_transit_time_mins: number;
    smoothness_score: number;
  };
  waypoints: Array<{
    step_order: number;
    name: string;
    place_id: string;
    location: { lat: number; lng: number };
    suggested_time: string;
    reasoning: string;
  }>;
}

export interface PlanResponse {
  recommended_routes: PlannedRoute[];
}

export interface TripStop {
  stop_id: string;
  step_order: number;
  name: string;
  place_id: string;
  location: { lat: number; lng: number };
  suggested_time: string;
  reasoning: string;
  status: "pending" | "active" | "completed" | "skipped";
}

export interface Trip {
  trip_id: string;
  user_id: string;
  trip_date: string;
  status: "planned" | "active" | "disrupted" | "replanning" | "completed" | "cancelled";
  route_name: string;
  theme: string;
  google_maps_url: string;
  stops: TripStop[];
  active_alerts: unknown[];
  updated_at?: string;
  created_at?: string;
}

export interface SavedHotel {
  id: number;
  display_name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  license_number: string | null;
  source: string;
  source_url: string | null;
  hotel_id: string | null;
  saved_at: string | null;
}

export interface ListSavedHotelsResponse {
  hotels: SavedHotel[];
}

export interface CheckHotelResponse {
  legal: boolean;
  matchedBy?: string | null;
  hotel?: {
    name?: string;
    licenseNumber?: string;
    address?: string;
    lat?: number;
    lng?: number;
    hotelClass?: string;
    hotel_id?: string;
  } | null;
  warning?: string;
  matched_by?: string;
  hotel_id?: string;
  name_zh?: string;
  name_en?: string;
  license_number?: string;
  city?: string;
  address?: string;
  detail?: string;
  [key: string]: unknown;
}

export interface RealtimeWeatherResponse {
  forecast: unknown;
  nearest_district: string;
  district_centroid: { lat: number; lng: number };
  distance_km: number;
  cached: boolean;
}

export interface RealtimeListResponse<T> {
  count: number;
  cached: boolean;
}
