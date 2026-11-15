// OneMap (Singapore Land Authority) public search. No token is needed for this endpoint.
// Geocoded points are approximate: they mark the building or street, not the exact unit.

export type GeoPoint = { lat: number; lng: number; label: string };

const SG_BOUNDS = { minLat: 1.15, maxLat: 1.48, minLng: 103.6, maxLng: 104.1 };

export async function geocode(query: string): Promise<GeoPoint | null> {
  const url = new URL("https://www.onemap.gov.sg/api/common/elastic/search");
  url.searchParams.set("searchVal", query);
  url.searchParams.set("returnGeom", "Y");
  url.searchParams.set("getAddrDetails", "Y");
  url.searchParams.set("pageNum", "1");
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000), cache: "force-cache" });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: Array<Record<string, string>> };
    const hit = data.results?.[0];
    if (!hit) return null;
    const lat = Number(hit.LATITUDE);
    const lng = Number(hit.LONGITUDE);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < SG_BOUNDS.minLat || lat > SG_BOUNDS.maxLat || lng < SG_BOUNDS.minLng || lng > SG_BOUNDS.maxLng) return null;
    return { lat, lng, label: hit.ADDRESS || hit.SEARCHVAL || query };
  } catch {
    return null;
  }
}
