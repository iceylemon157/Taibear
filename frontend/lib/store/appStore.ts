import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface UserPreferences {
  categories: Record<string, string[]>;
  selectedTags: string[];
  completedAt: string;
  reelsUrl?: string;
}

export interface UserProfile {
  gender: string;
  ageRange: string;
  country: string;
}

export interface HiddenSpot {
  name: string;
  description: string;
  submittedAt: string;
}

interface AppStore {
  userEmail: string | null;
  setUserEmail: (email: string | null) => void;
  selectedHotelId: string | null;
  setSelectedHotelId: (id: string | null) => void;
  userPreferences: UserPreferences | null;
  setUserPreferences: (prefs: UserPreferences) => void;
  clearUserPreferences: () => void;
  userProfile: UserProfile | null;
  setUserProfile: (profile: UserProfile) => void;
  hiddenSpot: HiddenSpot | null;
  setHiddenSpot: (spot: HiddenSpot) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      userEmail: null,
      setUserEmail: (email) => set({ userEmail: email }),
      selectedHotelId: null,
      setSelectedHotelId: (id) => set({ selectedHotelId: id }),
      userPreferences: null,
      setUserPreferences: (prefs) => set({ userPreferences: prefs }),
      clearUserPreferences: () => set({ userPreferences: null }),
      userProfile: null,
      setUserProfile: (profile) => set({ userProfile: profile }),
      hiddenSpot: null,
      setHiddenSpot: (spot) => set({ hiddenSpot: spot }),
    }),
    { name: "taibear-app" }
  )
);
