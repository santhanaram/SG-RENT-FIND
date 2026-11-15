"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { Listing } from "@/lib/search/schema";

const SG_CENTER: [number, number] = [1.3521, 103.8198];
const SG_BOUNDS: [[number, number], [number, number]] = [
  [1.144, 103.535],
  [1.494, 104.502],
];

const ONEMAP_ATTRIBUTION =
  '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" style="height:20px;width:20px;display:inline"/>&nbsp;<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>';

function FitView({ listings, center, selected }: { listings: Listing[]; center: { lat: number; lng: number } | null; selected: string | null }) {
  const map = useMap();
  useEffect(() => {
    const pts = listings.filter((l) => l.lat !== null).map((l) => [l.lat!, l.lng!] as [number, number]);
    if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
    else if (pts.length === 1) map.setView(pts[0], 15);
    else if (center) map.setView([center.lat, center.lng], 14);
  }, [listings, center, map]);
  useEffect(() => {
    const l = listings.find((x) => x.fingerprint === selected);
    if (l?.lat != null) map.flyTo([l.lat, l.lng!], Math.max(map.getZoom(), 15), { duration: 0.6 });
  }, [selected, listings, map]);
  return null;
}

export default function ListingMap({
  listings,
  center,
  selected,
  onSelect,
  shortlisted,
}: {
  listings: Listing[];
  center: { lat: number; lng: number } | null;
  selected: string | null;
  onSelect: (fingerprint: string) => void;
  shortlisted: Set<string>;
}) {
  return (
    <MapContainer
      center={SG_CENTER}
      zoom={12}
      minZoom={11}
      maxZoom={19}
      maxBounds={SG_BOUNDS}
      scrollWheelZoom
      className="h-full w-full rounded-lg"
    >
      <TileLayer
        url="https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png"
        attribution={ONEMAP_ATTRIBUTION}
        detectRetina
        minZoom={11}
        maxZoom={19}
      />
      {center && (
        <CircleMarker center={[center.lat, center.lng]} radius={6} pathOptions={{ color: "#1a2b3c", fillColor: "#1a2b3c", fillOpacity: 0.9, weight: 2 }}>
          <Tooltip>Search area</Tooltip>
        </CircleMarker>
      )}
      {listings
        .filter((l) => l.lat !== null && l.lng !== null)
        .map((l) => {
          const isSel = l.fingerprint === selected;
          const isShort = shortlisted.has(l.fingerprint);
          const color = isSel ? "#ba1a1a" : isShort ? "#1f7a4d" : "#006492";
          return (
            <CircleMarker
              key={l.fingerprint}
              center={[l.lat!, l.lng!]}
              radius={isSel ? 11 : 8}
              pathOptions={{ color: "#ffffff", weight: 2, fillColor: color, fillOpacity: 0.95 }}
              eventHandlers={{ click: () => onSelect(l.fingerprint) }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                {l.monthly_rent ? `S$${l.monthly_rent.toLocaleString()}/mo` : "Rent not stated"}
                {l.title ? ` · ${l.title}` : ""}
              </Tooltip>
            </CircleMarker>
          );
        })}
      <FitView listings={listings} center={center} selected={selected} />
    </MapContainer>
  );
}
