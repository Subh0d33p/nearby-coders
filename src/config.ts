import * as vscode from "vscode";

export interface NearbyCodersConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseExchangeUrl: string;
  defaultRadiusMeters: number;
}

export function getNearbyCodersConfig(): NearbyCodersConfig {
  const configuration = vscode.workspace.getConfiguration("nearbyCoders");
  const env = process.env;

  return {
    supabaseUrl: configuration.get<string>("supabaseUrl", "").trim() || env.NEARBY_CODERS_SUPABASE_URL?.trim() || "",
    supabaseAnonKey:
      configuration.get<string>("supabaseAnonKey", "").trim() || env.NEARBY_CODERS_SUPABASE_ANON_KEY?.trim() || "",
    supabaseExchangeUrl:
      configuration.get<string>("supabaseExchangeUrl", "").trim() || env.NEARBY_CODERS_SUPABASE_EXCHANGE_URL?.trim() || "",
    defaultRadiusMeters: configuration.get<number>("defaultRadiusMeters", Number(env.NEARBY_CODERS_DEFAULT_RADIUS_METERS) || 50000)
  };
}
