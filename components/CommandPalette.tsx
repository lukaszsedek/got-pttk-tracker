"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TrailDot } from "@/components/ui";
import type { SegmentRow } from "@/types/pttk";

interface Props {
  segments: SegmentRow[];
  completedIds: ReadonlySet<string>;
  onPick: (id: string) => void;
  onClose: () => void;
}

const norm = (s: string) =>
  s.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function CommandPalette({ segments, completedIds, onPick, onClose }: Props) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const results = useMemo(() => {
    const nq = norm(q.trim());
    const list = segments.filter((s) => (!nq || norm(`${s.name} ${s.regionName}`).includes(nq)));
    return list.slice(0, 12);
  }, [segments, q]);

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 pt-[12vh]" onClick={onClose}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setIdx(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIdx((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && results[idx]) {
              onPick(results[idx].id);
              onClose();
            } else if (e.key === "Escape") onClose();
          }}
          placeholder="Szukaj odcinka: np. Nosal, Kasprowy, Mogielica…"
          className="w-full border-0 border-b border-zinc-200 px-5 py-4 text-base outline-none dark:border-zinc-700"
        />
        <ul className="max-h-[50vh] overflow-auto py-1">
          {results.map((s, i) => (
            <li key={s.id}>
              <button
                onMouseEnter={() => setIdx(i)}
                onClick={() => {
                  onPick(s.id);
                  onClose();
                }}
                className={`flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm ${
                  i === idx ? "bg-zinc-100 dark:bg-zinc-800" : ""
                }`}
              >
                {s.trailColor ? <TrailDot color={s.trailColor} /> : <span className="h-3 w-3 rounded-full border" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.name}</span>
                  <span className="text-xs text-zinc-500">
                    {s.regionName || s.groupId} · {s.gotPointsForward}/{s.gotPointsBackward} pkt{s.geometry ? ` · ${s.distanceKm} km` : " · brak przebiegu"}
                  </span>
                </span>
                {completedIds.has(s.id) && <span className="text-green-600">✓</span>}
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="px-5 py-6 text-center text-sm text-zinc-500">Brak wyników.</li>}
        </ul>
        <div className="border-t border-zinc-200 px-5 py-2 text-xs text-zinc-500 dark:border-zinc-700">
          ↑↓ wybór · Enter otwórz · Esc zamknij
        </div>
      </div>
    </div>
  );
}
