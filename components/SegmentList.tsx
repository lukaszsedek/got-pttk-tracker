import { Card, TrailDot } from "@/components/ui";
import type { PttkSegment } from "@/types/pttk";

interface Props {
  segments: PttkSegment[];
  completedIds: ReadonlySet<string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export default function SegmentList({ segments, completedIds, selectedId, onSelect }: Props) {
  return (
    <Card title={`Odcinki (${segments.length})`}>
      <ul className="flex flex-col gap-1">
        {segments.map((s) => {
          const done = completedIds.has(s.id);
          const active = s.id === selectedId;
          return (
            <li key={s.id}>
              <button
                onClick={() => onSelect(active ? null : s.id)}
                className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors ${
                  active
                    ? "bg-amber-50 ring-1 ring-amber-400 dark:bg-amber-950/30"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                <span className="mt-1">
                  <TrailDot color={s.trailColor} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block leading-snug font-medium">{s.name}</span>
                  <span className="text-xs text-zinc-500">
                    {s.distanceKm} km · +{s.elevationGainM} m · {s.gotPointsForward}/{s.gotPointsBackward} pkt
                  </span>
                </span>
                <span
                  className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    done
                      ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
                  }`}
                >
                  {done ? "zaliczony" : "do zrobienia"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
