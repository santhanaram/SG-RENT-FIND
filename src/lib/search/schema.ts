import { z } from "zod";

export const PROPERTY_TYPES = ["Any", "HDB", "Condo", "Landed", "Other"] as const;

export const searchInputSchema = z.object({
  location: z.string().trim().min(2, "Enter an area, estate or MRT station").max(120),
  maxBudget: z.coerce.number().int().positive().max(100_000).optional(),
  propertyType: z.enum(PROPERTY_TYPES).default("Any"),
  bedrooms: z.coerce.number().int().min(0).max(10).optional(),
  maxMrtKm: z.coerce.number().positive().max(10).optional(),
});
export type SearchInput = z.infer<typeof searchInputSchema>;

const nullableString = z.string().trim().min(1).nullish().transform((v) => v ?? null);
const nullableInt = z.coerce.number().int().nonnegative().nullish().catch(null).transform((v) => v ?? null);

// What the model returns for each listing. Missing facts must be null, never guessed.
export const rawListingSchema = z.object({
  title: nullableString,
  property_type: z.enum(["HDB", "Condo", "Landed", "Other"]).nullish().catch(null).transform((v) => v ?? null),
  monthly_rent: nullableInt,
  bedrooms: nullableInt,
  bathrooms: nullableInt,
  floor_area_sqft: nullableInt,
  address: nullableString,
  nearest_mrt: nullableString,
  mrt_note: nullableString,
  available_from: nullableString,
  furnishing: nullableString,
  listed_on: nullableString,
  source_urls: z.array(z.string().url()).min(1),
  evidence: nullableString,
});
export type RawListing = z.infer<typeof rawListingSchema>;

export const rawResultSchema = z.object({
  listings: z.array(z.unknown()).default([]),
  summary: z.string().nullish(),
  inaccessible_sources: z.array(z.string()).nullish(),
});

export type Listing = RawListing & {
  fingerprint: string;
  lat: number | null;
  lng: number | null;
  geocodedFrom: string | null;
  sourceSites: string[];
};

export type SearchResult = {
  searchId: string | null;
  saved: boolean;
  center: { lat: number; lng: number } | null;
  listings: Listing[];
  dropped: number;
  summary: string | null;
  inaccessibleSources: string[];
};

export type StreamEvent =
  | { type: "progress"; message: string }
  | { type: "result"; result: SearchResult }
  | { type: "error"; message: string };
