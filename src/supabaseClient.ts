import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getNearbyCodersConfig } from "./config";
import { NearbyCoder, ProfileInput, ProfileRecord } from "./types";

type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRecord & { location: unknown };
      };
    };
    Functions: {
      match_coders: {
        Args: {
          user_lat: number;
          user_long: number;
          radius_meters: number;
        };
        Returns: NearbyCoder[];
      };
    };
  };
};

export class NearbyCodersRepository {
  private readonly client: SupabaseClient<Database>;

  public constructor(accessToken?: string) {
    const { supabaseUrl, supabaseAnonKey } = getNearbyCodersConfig();

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing nearbyCoders.supabaseUrl or nearbyCoders.supabaseAnonKey.");
    }

    this.client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      global: accessToken
        ? {
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          }
        : undefined
    });
  }

  public async getMyProfile(userId: string): Promise<ProfileRecord | null> {
    const { data, error } = await this.client
      .from("profiles")
      .select("account_id, id, username, avatar_url, github_id, city, country, skills, online_status, created_at")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  }

  public async upsertProfile(userId: string,  input: ProfileInput): Promise<ProfileRecord> {
    const { data, error } = await this.client
      .from("profiles")
      .upsert(
        {
          id: userId,
          username: input.username,
          avatar_url: input.avatar_url,
          github_id: input.github_id,
          city: input.city,
          country: input.country,
          skills: input.skills,
          online_status: input.online_status,
          last_seen: input.last_seen,
          location: `SRID=4326;POINT(${input.coordinates.longitude} ${input.coordinates.latitude})`
        } as never,
        {
          onConflict: "id"
        }
      )
      .select("account_id, id, username, avatar_url, github_id, city, country, skills, online_status, created_at")
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  public async matchCoders(latitude: number, longitude: number, radiusMeters: number): Promise<NearbyCoder[]> {
    const { data, error } = await (this.client as any).rpc("match_coders", {
  user_lat: latitude,
  user_long: longitude,
  radius_meters: radiusMeters
});

    if (error) {
      throw error;
    }

    return data ?? [];
  }
}
