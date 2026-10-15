"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection, LineString } from "geojson";
import type { PttkSegment } from "@/types/pttk";

interface MapProps {
  segments: PttkSegment[];
  completedIds: Set<string>;
  center?: [number, number]; // [lng, lat]
  zoom?: number;
}

type SegmentProps = {
  id: string;
  name: string;
  completed: boolean;
  gotPointsForward: number;
  gotPointsBackward: number;
  distanceKm: number;
  elevationGainM: number;
};

const SOURCE = "segments";

function toFeatureCollection(
  segments: PttkSegment[],
  completedIds: Set<string>,
): FeatureCollection<LineString, SegmentProps> {
  return {
    type: "FeatureCollection",
    features: segments.map(
      (s): Feature<LineString, SegmentProps> => ({
        type: "Feature",
        geometry: s.geometry,
        properties: {
          id: s.id,
          name: s.name,
          completed: completedIds.has(s.id),
          gotPointsForward: s.gotPointsForward,
          gotPointsBackward: s.gotPointsBackward,
          distanceKm: s.distanceKm,
          elevationGainM: s.elevationGainM,
        },
      }),
    ),
  };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export default function Map({
  segments,
  completedIds,
  center = [19.99, 49.255],
  zoom = 12.5,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const dataRef = useRef<FeatureCollection<LineString, SegmentProps> | null>(
    null,
  );

  useEffect(() => {
    dataRef.current = toFeatureCollection(segments, completedIds);
  }, [segments, completedIds]);

  // Inicjalizacja mapy (raz).
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      center,
      zoom,
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
      map.addSource(SOURCE, {
        type: "geojson",
        data:
          dataRef.current ?? toFeatureCollection([], new Set<string>()),
      });

      // Obrys dla czytelności.
      map.addLayer({
        id: "segments-casing",
        type: "line",
        source: SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 8, "line-opacity": 0.8 },
      });
      map.addLayer({
        id: "segments-line",
        type: "line",
        source: SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["case", ["get", "completed"], "#16a34a", "#6b7280"],
          "line-width": ["case", ["get", "completed"], 5, 4],
          "line-opacity": ["case", ["get", "completed"], 1, 0.55],
        },
      });

      map.on("click", "segments-line", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as unknown as SegmentProps;
        new maplibregl.Popup({ closeButton: true })
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font:13px system-ui;color:#111">
              <strong>${escapeHtml(p.name)}</strong><br/>
              GOT: ${p.gotPointsForward} pkt tam / ${p.gotPointsBackward} pkt z powrotem<br/>
              Dystans: ${p.distanceKm} km<br/>
              Suma podejść: ${p.elevationGainM} m<br/>
              Status: ${p.completed ? "✅ zaliczony" : "⬜ nieprzebyty"}
            </div>`,
          )
          .addTo(map);
      });
      map.on("mouseenter", "segments-line", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "segments-line", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Aktualizacja danych po zmianie postępu.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () =>
      (map.getSource(SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(
        toFeatureCollection(segments, completedIds),
      );
    if (map.isStyleLoaded()) update();
    else map.once("load", update);
  }, [segments, completedIds]);

  return <div ref={containerRef} className="h-full w-full" />;
}
