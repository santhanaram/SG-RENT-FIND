"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bath, BedDouble, ExternalLink, Loader2, MapPin, Ruler, Search, Star, TrainFront, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { PROPERTY_TYPES, type Listing, type SearchResult, type StreamEvent } from "@/lib/search/schema";

const ListingMap = dynamic(() => import("@/components/map/listing-map"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-muted-foreground">Loading map…</div>,
});

type ShortlistEntry = { listing: Listing; notes: string; addedAt: string };
const LS_SHORTLIST = "sgrf:shortlist";
const LS_LAST = "sgrf:last-result";

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const selectClass =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";

function rentVerified(l: Listing) {
  if (!l.monthly_rent || !l.evidence) return false;
  const digits = l.evidence.replace(/[^0-9]/g, "");
  return digits.includes(String(l.monthly_rent));
}

type SortKey = "rent-asc" | "rent-desc" | "size-desc" | "beds-desc";

export function SearchDashboard() {
  const [form, setForm] = useState({ location: "", maxBudget: "", propertyType: "Any", bedrooms: "", maxMrtKm: "" });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [shortlist, setShortlist] = useState<Record<string, ShortlistEntry>>({});
  const [view, setView] = useState<"results" | "shortlist">("results");

  // Client-side filters on the results
  const [fMaxRent, setFMaxRent] = useState<number | null>(null);
  const [fBeds, setFBeds] = useState<string>("any");
  const [fType, setFType] = useState<string>("Any");
  const [fMappedOnly, setFMappedOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("rent-asc");

  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    setShortlist(load(LS_SHORTLIST, {}));
    const last = load<SearchResult | null>(LS_LAST, null);
    if (last) setResult(last);
  }, []);

  const shortlisted = useMemo(() => new Set(Object.keys(shortlist)), [shortlist]);

  const toggleShortlist = useCallback((l: Listing) => {
    setShortlist((prev) => {
      const next = { ...prev };
      if (next[l.fingerprint]) delete next[l.fingerprint];
      else next[l.fingerprint] = { listing: l, notes: "", addedAt: new Date().toISOString() };
      save(LS_SHORTLIST, next);
      return next;
    });
  }, []);

  const setNotes = useCallback((fp: string, notes: string) => {
    setShortlist((prev) => {
      if (!prev[fp]) return prev;
      const next = { ...prev, [fp]: { ...prev[fp], notes } };
      save(LS_SHORTLIST, next);
      return next;
    });
  }, []);

  const select = useCallback((fp: string) => {
    setSelected(fp);
    cardRefs.current[fp]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    setError(null);
    setProgress([]);
    setSelected(null);
    setView("results");
    const payload = {
      location: form.location,
      propertyType: form.propertyType,
      ...(form.maxBudget && { maxBudget: form.maxBudget }),
      ...(form.bedrooms !== "" && { bedrooms: form.bedrooms }),
      ...(form.maxMrtKm && { maxMrtKm: form.maxMrtKm }),
    };
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Search failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as StreamEvent;
          if (ev.type === "progress") setProgress((p) => (p[p.length - 1] === ev.message ? p : [...p, ev.message]));
          else if (ev.type === "error") setError(ev.message);
          else if (ev.type === "result") {
            setResult(ev.result);
            save(LS_LAST, ev.result);
            setFMaxRent(null);
            setFBeds("any");
            setFType("Any");
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setRunning(false);
    }
  }

  const baseList: Listing[] = useMemo(
    () => (view === "shortlist" ? Object.values(shortlist).map((s) => s.listing) : result?.listings ?? []),
    [view, shortlist, result],
  );

  const rentRange = useMemo(() => {
    const r = baseList.map((l) => l.monthly_rent).filter((x): x is number => !!x);
    return r.length ? { min: Math.min(...r), max: Math.max(...r) } : null;
  }, [baseList]);

  const visible = useMemo(() => {
    const out = baseList.filter((l) => {
      if (fMaxRent !== null && l.monthly_rent && l.monthly_rent > fMaxRent) return false;
      if (fBeds !== "any" && l.bedrooms !== Number(fBeds)) return false;
      if (fType !== "Any" && l.property_type !== fType) return false;
      if (fMappedOnly && l.lat === null) return false;
      return true;
    });
    const num = (v: number | null, dflt: number) => v ?? dflt;
    out.sort((a, b) => {
      switch (sort) {
        case "rent-asc": return num(a.monthly_rent, Infinity) - num(b.monthly_rent, Infinity);
        case "rent-desc": return num(b.monthly_rent, -1) - num(a.monthly_rent, -1);
        case "size-desc": return num(b.floor_area_sqft, -1) - num(a.floor_area_sqft, -1);
        case "beds-desc": return num(b.bedrooms, -1) - num(a.bedrooms, -1);
      }
    });
    return out;
  }, [baseList, fMaxRent, fBeds, fType, fMappedOnly, sort]);

  const shortCount = Object.keys(shortlist).length;

  return (
    <div className="space-y-6">
      <Card className="p-4 sm:p-6">
        <form onSubmit={runSearch} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] lg:items-end">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-navy">Location</span>
            <Input required placeholder="e.g. Tiong Bahru, Punggol, Novena MRT" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-navy">Max rent (S$/mo)</span>
            <Input type="number" min={100} step={100} placeholder="Any" value={form.maxBudget} onChange={(e) => setForm({ ...form, maxBudget: e.target.value })} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-navy">Type</span>
            <select className={selectClass} value={form.propertyType} onChange={(e) => setForm({ ...form, propertyType: e.target.value })}>
              {PROPERTY_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-navy">Bedrooms</span>
            <select className={selectClass} value={form.bedrooms} onChange={(e) => setForm({ ...form, bedrooms: e.target.value })}>
              <option value="">Any</option>
              <option value="0">Room / studio</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-navy">MRT within (km)</span>
            <Input type="number" min={0.1} max={10} step={0.1} placeholder="Any" value={form.maxMrtKm} onChange={(e) => setForm({ ...form, maxMrtKm: e.target.value })} />
          </label>
          <Button type="submit" disabled={running} className="sm:col-span-2 lg:col-span-1">
            {running ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}
            {running ? "Searching…" : "Search"}
          </Button>
        </form>

        {(running || progress.length > 0) && (
          <ol className="mt-4 space-y-1 text-sm text-muted-foreground" aria-live="polite">
            {progress.map((p, i) => (
              <li key={i} className="flex items-center gap-2">
                {running && i === progress.length - 1 ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <span className="size-3.5 text-verified">✓</span>}
                {p}
              </li>
            ))}
            {running && <li className="pt-1 text-xs">A live web search usually takes one to three minutes.</li>}
          </ol>
        )}
        {error && <p className="mt-4 rounded-lg bg-error-soft px-3 py-2 text-sm text-error">{error}</p>}
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border bg-surface p-1">
          {(["results", "shortlist"] as const).map((v) => (
            <button
              key={v}
              onClick={() => { setView(v); setSelected(null); }}
              className={cn("rounded-md px-3 py-1.5 text-sm font-medium", view === v ? "bg-primary text-primary-foreground" : "text-navy hover:bg-primary-tint")}
            >
              {v === "results" ? `Results${result ? ` (${result.listings.length})` : ""}` : `Shortlist (${shortCount})`}
            </button>
          ))}
        </div>
        {baseList.length > 0 && (
          <>
            <select aria-label="Sort" className={cn(selectClass, "h-9 w-auto")} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="rent-asc">Rent: low to high</option>
              <option value="rent-desc">Rent: high to low</option>
              <option value="size-desc">Largest first</option>
              <option value="beds-desc">Most bedrooms</option>
            </select>
            <select aria-label="Type filter" className={cn(selectClass, "h-9 w-auto")} value={fType} onChange={(e) => setFType(e.target.value)}>
              {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t === "Any" ? "All types" : t}</option>)}
            </select>
            <select aria-label="Bedrooms filter" className={cn(selectClass, "h-9 w-auto")} value={fBeds} onChange={(e) => setFBeds(e.target.value)}>
              <option value="any">All bedrooms</option>
              <option value="0">Room / studio</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} bed</option>)}
            </select>
            {rentRange && rentRange.max > rentRange.min && (
              <label className="flex items-center gap-2 text-sm text-navy">
                <span className="whitespace-nowrap">Up to S${(fMaxRent ?? rentRange.max).toLocaleString()}</span>
                <input
                  type="range"
                  min={rentRange.min}
                  max={rentRange.max}
                  step={50}
                  value={fMaxRent ?? rentRange.max}
                  onChange={(e) => setFMaxRent(Number(e.target.value))}
                  className="accent-[var(--primary)]"
                />
              </label>
            )}
            <label className="flex items-center gap-1.5 text-sm text-navy">
              <input type="checkbox" checked={fMappedOnly} onChange={(e) => setFMappedOnly(e.target.checked)} className="accent-[var(--primary)]" />
              On map only
            </label>
          </>
        )}
      </div>

      {view === "results" && result?.summary && (
        <Card className="space-y-2 p-4 text-sm">
          <p className="text-foreground">{result.summary}</p>
          <p className="text-xs text-muted-foreground">
            {result.dropped > 0 && `${result.dropped} result${result.dropped > 1 ? "s were" : " was"} left out because the source link couldn't be confirmed. `}
            {result.inaccessibleSources.length > 0 && `Couldn't read: ${result.inaccessibleSources.join(", ")}. `}
            {!result.saved && "This search wasn't saved to history yet (database step pending)."}
          </p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="order-2 space-y-3 lg:order-1 lg:max-h-[75vh] lg:overflow-y-auto lg:pr-1">
          {visible.length === 0 && (
            <Card className="p-6 text-sm text-muted-foreground">
              {view === "shortlist"
                ? "No shortlisted listings yet. Tap the star on a listing to keep it here."
                : result
                  ? "No listings match these filters."
                  : "Run a search to see real listings from across the web. Every listing links to the page it came from."}
            </Card>
          )}
          {visible.map((l) => (
            <ListingCard
              key={l.fingerprint}
              listing={l}
              ref={(el) => { cardRefs.current[l.fingerprint] = el; }}
              selected={selected === l.fingerprint}
              onSelect={() => setSelected(l.fingerprint)}
              starred={shortlisted.has(l.fingerprint)}
              onStar={() => toggleShortlist(l)}
              notes={shortlist[l.fingerprint]?.notes}
              onNotes={(n) => setNotes(l.fingerprint, n)}
            />
          ))}
        </div>
        <div className="order-1 h-[50vh] overflow-hidden rounded-lg border border-border lg:sticky lg:top-4 lg:order-2 lg:h-[75vh]">
          <ListingMap
            listings={visible}
            center={view === "results" ? result?.center ?? null : null}
            selected={selected}
            onSelect={select}
            shortlisted={shortlisted}
          />
        </div>
      </div>
    </div>
  );
}

function ListingCard({
  listing: l,
  selected,
  onSelect,
  starred,
  onStar,
  notes,
  onNotes,
  ref,
}: {
  listing: Listing;
  selected: boolean;
  onSelect: () => void;
  starred: boolean;
  onStar: () => void;
  notes?: string;
  onNotes: (n: string) => void;
  ref: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={ref}
      onClick={onSelect}
      className={cn(
        "cursor-pointer rounded-lg border bg-surface p-4 shadow-sm transition-colors",
        selected ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="tabular text-lg font-semibold text-navy">
            {l.monthly_rent ? `S$${l.monthly_rent.toLocaleString()}` : "Rent not stated"}
            {l.monthly_rent && <span className="text-sm font-normal text-muted-foreground"> /month</span>}
          </p>
          <p className="truncate text-sm font-medium">{l.title ?? l.address ?? "Untitled listing"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onStar(); }}
            aria-label={starred ? "Remove from shortlist" : "Add to shortlist"}
            aria-pressed={starred}
            className={cn("rounded-md p-1.5 hover:bg-primary-tint", starred ? "text-estimated" : "text-muted-foreground")}
          >
            <Star className={cn("size-5", starred && "fill-current")} aria-hidden />
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {l.property_type && <span className="font-medium text-navy">{l.property_type}</span>}
        {l.bedrooms !== null && <span className="flex items-center gap-1"><BedDouble className="size-4" aria-hidden />{l.bedrooms === 0 ? "Room/studio" : `${l.bedrooms} bed`}</span>}
        {l.bathrooms !== null && <span className="flex items-center gap-1"><Bath className="size-4" aria-hidden />{l.bathrooms} bath</span>}
        {l.floor_area_sqft !== null && <span className="flex items-center gap-1"><Ruler className="size-4" aria-hidden />{l.floor_area_sqft.toLocaleString()} sqft</span>}
        {l.nearest_mrt && <span className="flex items-center gap-1"><TrainFront className="size-4" aria-hidden />{l.nearest_mrt}{l.mrt_note ? ` · ${l.mrt_note}` : ""}</span>}
      </div>

      {l.address && (
        <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{l.address}</span>
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {rentVerified(l) ? <StatusBadge status="verified" /> : <StatusBadge status="unverified" />}
        {l.lat !== null ? (
          <span className="inline-flex items-center gap-1"><StatusBadge status="estimated" /> map pin</span>
        ) : (
          <span className="text-muted-foreground">Not on map (no address)</span>
        )}
        {l.available_from && <span className="text-muted-foreground">Available: {l.available_from}</span>}
        {l.furnishing && <span className="text-muted-foreground">{l.furnishing}</span>}
        {l.listed_on && <span className="text-muted-foreground">Listed: {l.listed_on}</span>}
      </div>

      {selected && l.evidence && (
        <blockquote className="mt-2 border-l-2 border-primary/40 pl-2 text-xs italic text-muted-foreground">“{l.evidence}”</blockquote>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {l.source_urls.map((u, i) => (
          <a
            key={u}
            href={u}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-primary hover:bg-primary-tint"
          >
            {l.sourceSites[i] ?? "Source"} <ExternalLink className="size-3" aria-hidden />
          </a>
        ))}
      </div>

      {starred && (
        <div className="mt-3" onClick={(e) => e.stopPropagation()}>
          <div className="relative">
            <textarea
              value={notes ?? ""}
              onChange={(e) => onNotes(e.target.value)}
              placeholder="Notes: viewing time, questions for the agent…"
              rows={2}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            />
            {notes && (
              <button aria-label="Clear notes" onClick={() => onNotes("")} className="absolute right-2 top-2 text-muted-foreground hover:text-navy">
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
