export interface GithubIdentity {
  accessToken: string;
  accountLabel: string;
  githubUserId: string;
  username: string;
  avatarUrl: string;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface LocationSearchResult extends Coordinates {
  displayName: string;
  city: string;
  country: string;
}

export interface ProfileInput {
  username: string;
  avatar_url: string;
  github_id: string;
  city: string;
  country: string;
  skills: string[];
  last_seen?: string;
  online_status: boolean;
  coordinates: Coordinates;
}

export interface ProfileRecord {
  account_id: number;
  id: string;
  username: string | null;
  avatar_url: string | null;
  github_id: string | null;
  city: string | null;
  country: string | null;
  skills: string[] | null;
  last_seen?: string | null;
  online_status: boolean | null;
  created_at: string;
}

export interface NearbyCoder extends ProfileRecord {
  distance_meters: number;
}

export interface SessionState {
  isAuthenticated: boolean;
  profile: ProfileRecord | null;
  nearbyCoders: NearbyCoder[];
  authMode: "github-vscode" | "supabase-edge-exchange" | "signed-out";
}

export type WebviewIncomingMessage =
  | { type: "ready" }
  | { type: "login" }
  | { type: "logout" }
  | {
      type: "saveProfile";
      payload: {
        cityQuery: string;
        skillsInput: string;
        onlineStatus: boolean;
      };
    }
  | {
      type: "refreshNearby";
      payload?: { radiusMeters?: number };
    }
 | { type: "autoLocation" };

export type WebviewOutgoingMessage =
  | { type: "state"; payload: SessionState }
  | { type: "loading"; payload: { value: boolean } }
  | { type: "toast"; payload: { message: string; level: "info" | "error" | "success" } };
