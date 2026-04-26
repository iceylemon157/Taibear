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

export interface TspEvaluation {
  total_transit_time_mins: number;
  smoothness_score: number;
}

export interface PlannedRoute {
  route_id: string;
  route_name: string;
  theme: string;
  google_maps_url: string;
  tsp_evaluation: TspEvaluation;
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

export interface GeocodeItem {
  name: string;
  place_id: string;
  lat: number;
  lng: number;
  opening_hours: string[];
  found: boolean;
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
  tsp_evaluation?: TspEvaluation | null;
  google_maps_url: string;
  original_route_id?: string;
  stops: TripStop[];
  active_alerts: unknown[];
  updated_at?: string;
  created_at?: string;
}

export interface EnrichReview {
  author: string;
  rating: number;
  text: string;
  time: string;
}

export interface EnrichedPlace {
  place_name: string;
  place_id: string;
  folder: string;
  photo_urls?: string[];
  reviews: {
    newest: EnrichReview[];
    most_relevant: EnrichReview[];
  };
  captions: string[];
  photos: string[];
}

export interface EnrichedRoute {
  route_id: string;
  route_name: string;
  places: EnrichedPlace[];
}

export interface EnrichResponse {
  run_id: string;
  output_dir: string;
  routes: Record<string, EnrichedRoute>;
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

export interface HotelSearchResult {
  hotel_id: string | null;
  name: string;
  name_zh?: string | null;
  name_en?: string | null;
  city?: string | null;
  address?: string | null;
  license_number?: string | null;
  lat?: number | null;
  lng?: number | null;
  hotel_class?: string | null;
  score: number;
  reason: string;
}

export interface HotelSearchResponse {
  query: string;
  location?: string | null;
  tags: string[];
  total_candidates: number;
  ranked_hotels: HotelSearchResult[];
  used_llm: boolean;
  warning?: string | null;
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

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface ComputeRoutePayload {
  origin: RoutePoint;
  destination: RoutePoint;
  travelMode: "TRANSIT" | "WALKING" | "DRIVING";
  intermediates?: RoutePoint[];
}

export interface ComputeRouteResponse {
  path: RoutePoint[];
  distanceMeters: number;
  durationSeconds: number;
  cached: boolean;
}
