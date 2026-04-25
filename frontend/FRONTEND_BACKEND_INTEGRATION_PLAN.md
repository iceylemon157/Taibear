# Frontend-Backend Integration Plan

## Goal
Connect the frontend to existing backend services without changing backend code.

## Verified Backend Services
- Agent service: `http://localhost:8001`
- Trip manager service: `http://localhost:8003`
- User profile manager service: `http://localhost:8004`
- Realtime monitor service: `http://localhost:8005`

## Frontend Integration Strategy

### Phase 1: Foundation (BFF + shared client utilities)
1. Add Next.js route handlers under `app/api/bff/*` to proxy frontend calls to backend services.
2. Keep API keys server-side in route handlers (do not expose in browser code).
3. Add shared frontend API client helpers and typed service wrappers in `lib/api/*`.
4. Add local session utilities in `lib/auth/*`.

### Phase 2: Auth and profile wiring
1. Wire `login` page to fetch user profile by email.
2. Wire `signup` page to create user profile.
3. Persist session in localStorage (user id and display name).
4. Add app-route auth guard at `(app)` layout level.
5. Wire profile page to load and update user profile.

### Phase 3: Trips wiring
1. Connect prompt/tag flow to agent `/search` and `/plan`.
2. Create trip in trip manager from selected route.
3. Load user trip IDs and trip details for ongoing/recent UI.

### Phase 4: Hotels and extension wiring
1. Connect hotel legality checks to agent `/api/check-hotel`.
2. Connect save/list to `/api/save-hotel` and `/api/saved-hotels`.
3. Replace hardcoded hotel list section with backend-sourced saved hotels.

### Phase 5: Explore + realtime wiring
1. Connect selected map pin to realtime endpoints (`weather`, `mrt`, `bus`, `ubike`).
2. Show live summary data in explore detail card.

### Phase 6: Validation
1. Run TypeScript/build checks.
2. Fix integration-level type and runtime issues.

## Endpoint Mapping

### Agent
- `POST /search` (requires API key)
- `POST /plan` (requires API key)
- `GET /api/check-hotel`
- `POST /api/save-hotel`
- `GET /api/saved-hotels`
- `GET /hidden-spots` (requires API key, optional explore enrichment)

### Trip Manager
- `POST /trips`
- `GET /trips/{trip_id}`
- `GET /users/{user_id}/trips`
- `POST /trips/{trip_id}/activate`
- `POST /trips/{trip_id}/check`

### User Profile Manager
- `POST /users/`
- `GET /users/{user_id}`
- `PUT /users/{user_id}`

### Realtime Monitor
- `GET /weather?lat=&lng=`
- `GET /mrt?lat=&lng=`
- `GET /bus?lat=&lng=`
- `GET /ubike?lat=&lng=`

## Deliverables in this implementation pass
- Add BFF route handlers and shared API/auth utilities.
- Wire login, signup, profile, trips, hotels, and explore pages to backend.
- Keep current UI style while replacing mock data paths with real backend integration.
