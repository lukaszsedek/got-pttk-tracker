import type { ReactNode } from "react";

export function Card({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const TRAIL_BG = {
  Red: "bg-red-500",
  Blue: "bg-blue-500",
  Green: "bg-green-600",
  Yellow: "bg-yellow-400",
  Black: "bg-zinc-900 dark:bg-zinc-200",
} as const;

export function TrailDot({ color }: { color: keyof typeof TRAIL_BG }) {
  return <span className={`inline-block h-3 w-3 shrink-0 rounded-full ${TRAIL_BG[color]}`} />;
}
