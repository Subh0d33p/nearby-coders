import * as vscode from "vscode";

const DEFAULT_SUPABASE_URL =
  "https://fuhphtalkwbpajwclex.supabase.co";

const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1aHBodGFsa3dicGFqdndjbGV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyODg4NzUsImV4cCI6MjA4OTg2NDg3NX0.-_c72Zpe0yARJPljZoiw28p52fduQg1GJkfMx-cayCQ";

const DEFAULT_EXCHANGE_URL =
  "https://fuhphtalkwbpajwclex.supabase.co/functions/v1/github-exchange";

export function getNearbyCodersConfig() {
  const config = vscode.workspace.getConfiguration("nearbyCoders");

  return {
    supabaseUrl:
      config.get<string>("supabaseUrl") ||
      DEFAULT_SUPABASE_URL,

    supabaseAnonKey:
      config.get<string>("supabaseAnonKey") ||
      DEFAULT_SUPABASE_ANON_KEY,

    supabaseExchangeUrl:
      config.get<string>("supabaseExchangeUrl") ||
      DEFAULT_EXCHANGE_URL,

    defaultRadiusMeters:
      config.get<number>("defaultRadiusMeters") ?? 50000
  };
}