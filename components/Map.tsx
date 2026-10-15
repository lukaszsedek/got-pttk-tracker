"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection, LineString } from "geojson";
import type { SegmentRow } from "@/types/pttk";

export type MapSegment = SegmentRow & { geometry: LineString };

interface MapProps {
  segments: MapSegment[];
  completedIds: ReadonlySet<string>;
  /** Odcinek wybrany z listy — podświetlany i wycentrowany. */
  selectedId?: string | null;
  /** Odcinki wykryte w podglądzie importu GPX. */
  highlightIds?: ReadonlySet<string>;
  /** Ślad aktywności [lng, lat][] — rysowany na niebiesko. */
  track?: [number, number][] | null;
  onSelect?: (id: string) => void;
}

const SRC = "segments";
const TRACK = "track";

const COLORS = {
  Red: "#dc2626",
  Blue: "#2563eb",
  Green: "#16a34a",
  Yellow: "#eab308",
  Black: "#27272a",
} as const;

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function collection(
  segments: MapSegment[],
  completed: ReadonlySet<string>,
  highlight: ReadonlySet<string>,
): FeatureCollection<LineString> {
  return {
    type: "FeatureCollection",
    features: segments.map(
      (s): Feature<LineString> => ({
        type: "Feature",
        geometry: s.geometry,
        properties: {
          id: s.id,
          name: s.name,
          region: s.regionName,
          completed: completed.has(s.id),
          highlighted: highlight.has(s.id),
          color: s.trailColor ? COLORS[s.trailColor] : "#71717a",
          pf: s.gotPointsForward,
          pb: s.gotPointsBackward,
          km: s.distanceKm,
          gain: s.elevationGainM,
        },
      }),
    ),
  };
}

function bounds(coords: [number, number][]) {
  const b = new maplibregl.LngLatBounds();
  for (const c of coords) b.extend(c);
  return b;
}

export default function Map({
  segments,
  completedIds,
  selectedId = null,
  highlightIds,
  track = null,
  onSelect,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const fittedRef = useRef(false);
  const latest = useRef({ segments, completedIds, highlightIds, track, selectedId, onSelect });
  useEffect(() => {
    latest.current = { segments, completedIds, highlightIds, track, selectedId, onSelect };
  });

  const fitAll = (map: maplibregl.Map, segs: MapSegment[]) => {
    const pts = segs.flatMap((s) => s.geometry.coordinates as [number, number][]);
    if (pts.length) map.fitBounds(bounds(pts), { padding: 50, maxZoom: 13, duration: 0 });
  };

  // Inicjalizacja mapy.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      center: [19.95, 49.25],
      zoom: 10,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
            maxzoom: 19,
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      const l = latest.current;
      map.addSource(SRC, {
        type: "geojson",
        data: collection(l.segments, l.completedIds, l.highlightIds ?? new Set()),
      });
      map.addSource(TRACK, {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
      });

      map.addLayer({
        id: "seg-casing",
        type: "line",
        source: SRC,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.85 },
      });
      // Kolor znakowania szlaku; zaliczone — pogrubione i zielone obramowanie.
      map.addLayer({
        id: "seg-done",
        type: "line",
        source: SRC,
        filter: ["==", ["get", "completed"], true],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#22c55e", "line-width": 11, "line-opacity": 0.55 },
      });
      map.addLayer({
        id: "seg-line",
        type: "line",
        source: SRC,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": 4,
          "line-opacity": ["case", ["get", "completed"], 1, 0.8],
        },
      });
      map.addLayer({
        id: "seg-highlight",
        type: "line",
        source: SRC,
        filter: ["==", ["get", "highlighted"], true],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#f59e0b", "line-width": 9, "line-opacity": 0.8 },
      });
      map.addLayer({
        id: "seg-selected",
        type: "line",
        source: SRC,
        filter: ["==", ["get", "id"], ""],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#f97316", "line-width": 10 },
      });
      map.addLayer({
        id: "track-casing",
        type: "line",
        source: TRACK,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 6 },
      });
      map.addLayer({
        id: "track-line",
        type: "line",
        source: TRACK,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#0ea5e9", "line-width": 3.5, "line-dasharray": [2, 1.2] },
      });

      map.on("click", "seg-line", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Record<string, string | number | boolean>;
        latest.current.onSelect?.(String(p.id));
        new maplibregl.Popup({ closeButton: true })
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font:13px system-ui;color:#111">
              <strong>${esc(String(p.name))}</strong><br/>
              <span style="color:#666">${esc(String(p.region))}</span><br/>
              GOT: ${p.pf} pkt tam / ${p.pb} pkt z powrotem<br/>
              Dystans: ${p.km} km<br/>
              Status: ${p.completed ? "✅ zaliczony" : "⬜ do zrobienia"}
            </div>`,
          )
          .addTo(map);
      });
      map.on("mouseenter", "seg-line", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "seg-line", () => (map.getCanvas().style.cursor = ""));

      readyRef.current = true;
      if (l.segments.length && !fittedRef.current) {
        fitAll(map, l.segments);
        fittedRef.current = true;
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
  }, []);

  // Dane odcinków / zaliczenia / podgląd importu.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource(SRC) as maplibregl.GeoJSONSource).setData(
      collection(segments, completedIds, highlightIds ?? new Set()),
    );
    if (segments.length && !fittedRef.current && !track) {
      fitAll(map, segments);
      fittedRef.current = true;
    }
  }, [segments, completedIds, highlightIds, track]);

  // Ślad aktywności.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource(TRACK) as maplibregl.GeoJSONSource).setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: track ?? [] },
    });
    if (track && track.length > 1) map.fitBounds(bounds(track), { padding: 60, duration: 700 });
  }, [track]);

  // Wybrany odcinek.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.setFilter("seg-selected", ["==", ["get", "id"], selectedId ?? ""]);
    const seg = segments.find((s) => s.id === selectedId);
    if (seg) {
      map.fitBounds(bounds(seg.geometry.coordinates as [number, number][]), {
        padding: 90,
        maxZoom: 15,
        duration: 700,
      });
    }
  }, [selectedId, segments]);

  return <div ref={containerRef} className="h-full w-full" />;
}
