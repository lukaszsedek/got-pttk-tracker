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
  /** Odcinki dodane do planu. */
  planIds?: ReadonlySet<string>;
  /** Klucze "<id>|<kierunek>" zaliczonych kierunków (do akcji w popupie). */
  doneKeys?: ReadonlySet<string>;
  planKeys?: ReadonlySet<string>;
  /** Częściowe dopasowania z podglądu importu GPX. */
  partialIds?: ReadonlySet<string>;
  minPoints?: number;
  regionFilter?: string;
  /** Akcja z popupu: zaliczenie kierunku / plan / otwarcie szczegółów. */
  onQuick?: (id: string, action: "forward" | "backward" | "plan" | "open") => void;
  /** Tryb ręcznego rysowania przebiegu: punkty [lng,lat] i obsługa kliknięcia mapy. */
  drawPoints?: [number, number][] | null;
  onDrawClick?: (p: [number, number]) => void;
  /** Stan widoku do zapamiętania (środek, zoom). */
  initialView?: { center: [number, number]; zoom: number } | null;
  onViewChange?: (v: { center: [number, number]; zoom: number }) => void;
  showDone?: boolean;
  showTodo?: boolean;
  showTrack?: boolean;
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
  plan: ReadonlySet<string> = new Set(),
  partial: ReadonlySet<string> = new Set(),
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
          planned: plan.has(s.id),
          partial: partial.has(s.id),
          maxpts: Math.max(s.gotPointsForward, s.gotPointsBackward),
          regionKey: s.regionName || s.groupId,
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
  planIds,
  doneKeys,
  planKeys,
  partialIds,
  minPoints = 0,
  regionFilter = "",
  onQuick,
  drawPoints = null,
  onDrawClick,
  initialView = null,
  onViewChange,
  showDone = true,
  showTodo = true,
  showTrack = true,
  track = null,
  onSelect,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const fittedRef = useRef(false);
  const latest = useRef({ segments, completedIds, highlightIds, planIds, partialIds, doneKeys, planKeys, track, selectedId, onSelect, onQuick, onViewChange, drawPoints, onDrawClick });
  useEffect(() => {
    latest.current = { segments, completedIds, highlightIds, planIds, partialIds, doneKeys, planKeys, track, selectedId, onSelect, onQuick, onViewChange, drawPoints, onDrawClick };
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
      center: initialView?.center ?? [19.95, 49.25],
      zoom: initialView?.zoom ?? 10,
      style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
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
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
    if (initialView) fittedRef.current = true;
    map.on("moveend", () => {
      const c = map.getCenter();
      latest.current.onViewChange?.({ center: [c.lng, c.lat], zoom: map.getZoom() });
    });
    // Mapa dopasowuje się do zmiany rozmiaru kontenera (panel boczny).
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    map.once("remove", () => ro.disconnect());

    map.on("load", () => {
      const l = latest.current;
      map.addSource(SRC, {
        type: "geojson",
        data: collection(l.segments, l.completedIds, l.highlightIds ?? new Set(), l.planIds, l.partialIds),
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
        id: "seg-plan",
        type: "line",
        source: SRC,
        filter: ["==", ["get", "planned"], true],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#9333ea", "line-width": 9, "line-opacity": 0.7 },
      });
      map.addLayer({
        id: "seg-partial",
        type: "line",
        source: SRC,
        filter: ["==", ["get", "partial"], true],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ec4899", "line-width": 9, "line-opacity": 0.75 },
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
      map.addSource("draw", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "draw-line",
        type: "line",
        source: "draw",
        filter: ["==", ["geometry-type"], "LineString"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#e11d48", "line-width": 5, "line-dasharray": [1.5, 1] },
      });
      map.addLayer({
        id: "draw-pts",
        type: "circle",
        source: "draw",
        filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-radius": 5, "circle-color": "#ffffff", "circle-stroke-color": "#e11d48", "circle-stroke-width": 2 },
      });
      map.addLayer({
        id: "seg-label",
        type: "symbol",
        source: SRC,
        minzoom: 13,
        layout: {
          "symbol-placement": "line",
          "text-field": ["get", "name"],
          "text-font": ["Open Sans Regular"],
          "text-size": 11,
          "text-max-angle": 30,
        },
        paint: { "text-color": "#18181b", "text-halo-color": "#ffffff", "text-halo-width": 1.6 },
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

      const hover = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8, className: "got-hover" });
      map.on("mousemove", "seg-line", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Record<string, string | number>;
        map.getCanvas().style.cursor = "pointer";
        hover
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font:12px system-ui;color:#111"><strong>${esc(String(p.name))}</strong><br/>${p.pf}/${p.pb} pkt · ${p.km} km</div>`,
          )
          .addTo(map);
      });
      map.on("mouseleave", "seg-line", () => {
        map.getCanvas().style.cursor = "";
        hover.remove();
      });

      map.on("click", (e) => {
        if (latest.current.drawPoints) latest.current.onDrawClick?.([e.lngLat.lng, e.lngLat.lat]);
      });

      map.on("click", "seg-line", (e) => {
        if (latest.current.drawPoints) return;
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Record<string, string | number | boolean>;
        const id = String(p.id);
        hover.remove();
        latest.current.onSelect?.(id);
        const l2 = latest.current;
        const [from, to] = String(p.name).split(" – ");
        const el = document.createElement("div");
        el.style.cssText = "font:13px system-ui;color:#111;min-width:210px";
        el.innerHTML = `<strong>${esc(String(p.name))}</strong><br/><span style="color:#666">${esc(String(p.region))}</span><br/>${p.km} km`;
        const row = (label: string, done: boolean, action: "forward" | "backward" | "plan", pts?: number) => {
          const btn = document.createElement("button");
          btn.textContent = done ? `✓ ${label}` : pts !== undefined ? `${label} (${pts} pkt)` : label;
          btn.disabled = action !== "plan" && done;
          btn.style.cssText =
            "display:block;width:100%;margin-top:6px;padding:6px 8px;border-radius:8px;border:1px solid #d4d4d8;background:" +
            (done ? "#dcfce7" : "#fff") +
            ";cursor:pointer;text-align:left;font:inherit";
          btn.onclick = () => {
            latest.current.onQuick?.(id, action);
            popup.remove();
          };
          el.appendChild(btn);
        };
        row(`${from} → ${to}`, !!l2.doneKeys?.has(`${id}|forward`), "forward", Number(p.pf));
        row(`${to} → ${from}`, !!l2.doneKeys?.has(`${id}|backward`), "backward", Number(p.pb));
        row(l2.planKeys?.has(`${id}|forward`) || l2.planKeys?.has(`${id}|backward`) ? "Usuń z planu" : "Dodaj do planu", false, "plan");
        const popup = new maplibregl.Popup({ closeButton: true, maxWidth: "280px" })
          .setLngLat(e.lngLat)
          .setDOMContent(el)
          .addTo(map);
      });

      readyRef.current = true;
      if (l.track && l.track.length > 1) {
        // Ślad ustawiony, zanim mapa skończyła się ładować.
        (map.getSource(TRACK) as maplibregl.GeoJSONSource).setData({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: l.track },
        });
        map.fitBounds(bounds(l.track), { padding: 60, duration: 0 });
        fittedRef.current = true;
      } else if (l.segments.length && !fittedRef.current) {
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
      collection(segments, completedIds, highlightIds ?? new Set(), planIds, partialIds),
    );
    if (segments.length && !fittedRef.current && !track) {
      fitAll(map, segments);
      fittedRef.current = true;
    }
  }, [segments, completedIds, highlightIds, planIds, partialIds, track]);

  // Warstwy: przebyte / nieprzebyte / ślad.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    type Ex = maplibregl.ExpressionSpecification;
    const none: Ex = ["==", ["get", "id"], "__none__"];
    const done: Ex = ["==", ["get", "completed"], true];
    const todo: Ex = ["==", ["get", "completed"], false];
    const base: Ex = showDone && showTodo ? ["!=", ["get", "id"], "__none__"] : showDone ? done : showTodo ? todo : none;
    const extra: Ex[] = [];
    if (minPoints > 0) extra.push([">=", ["get", "maxpts"], minPoints]);
    if (regionFilter) extra.push(["==", ["get", "regionKey"], regionFilter]);
    const vis: Ex = extra.length ? ["all", base, ...extra] : base;
    map.setFilter("seg-casing", vis);
    map.setFilter("seg-line", vis);
    map.setFilter("seg-label", vis);
    map.setFilter("seg-done", showDone ? (extra.length ? ["all", done, ...extra] : done) : none);
    for (const id of ["track-casing", "track-line"]) {
      map.setLayoutProperty(id, "visibility", showTrack ? "visible" : "none");
    }
  }, [showDone, showTodo, showTrack, minPoints, regionFilter]);

  // Rysowanie przebiegu.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const pts = drawPoints ?? [];
    (map.getSource("draw") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: [
        ...(pts.length > 1
          ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: pts } }]
          : []),
        ...pts.map((c) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: c } })),
      ],
    });
    map.getCanvas().style.cursor = drawPoints ? "crosshair" : "";
  }, [drawPoints]);

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
