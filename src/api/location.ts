import { LocationSearchResult } from "../types";

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
  };
}

export async function geocodeCity(cityQuery: string): Promise<LocationSearchResult> {
  const query = cityQuery.trim();

  if (!query) {
    throw new Error("City is required.");
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "nearby-coders-vscode-extension"
    }
  });

  if (!response.ok) {
    throw new Error(`Nominatim lookup failed with status ${response.status}`);
  }

  const [result] = (await response.json()) as NominatimResult[];

  if (!result) {
    throw new Error("No location found for that city.");
  }

  return {
    displayName: result.display_name,
    city: result.address?.city ?? result.address?.town ?? result.address?.village ?? query,
    country: result.address?.country ?? "Unknown",
    latitude: Number(result.lat),
    longitude: Number(result.lon)
  };
}
