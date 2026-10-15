"use client";

export interface Toast {
  id: number;
  text: string;
  tone?: "ok" | "error";
  action?: { label: string; run: () => void };
}

export default function Toasts({ items, onDismiss }: { items: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-20 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 md:bottom-4"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-white shadow-lg ${
            t.tone === "error" ? "bg-red-700" : "bg-zinc-900 dark:bg-zinc-700"
          }`}
        >
          <span className="min-w-0 flex-1">{t.text}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action!.run();
                onDismiss(t.id);
              }}
              className="shrink-0 rounded-lg bg-white/15 px-2.5 py-1 font-semibold hover:bg-white/25"
            >
              {t.action.label}
            </button>
          )}
          <button onClick={() => onDismiss(t.id)} aria-label="Zamknij" className="shrink-0 opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
