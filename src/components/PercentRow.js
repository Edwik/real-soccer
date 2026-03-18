"use client";

import { useRef } from "react";

function colorByPct(pct) {
  if (pct >= 75) return "bg-emerald-400";
  if (pct >= 60) return "bg-lime-400";
  if (pct >= 45) return "bg-amber-400";
  return "bg-red-500";
}

function textColorByPct(pct) {
  if (pct >= 75) return "text-emerald-300";
  if (pct >= 60) return "text-lime-300";
  if (pct >= 45) return "text-amber-300";
  return "text-red-300";
}

export function PercentRow({ label, valuePct, toast, onToast, quotes }) {
  const pct = Number.isFinite(valuePct) ? valuePct : 0;
  const barClass = colorByPct(pct);
  const valueClass = textColorByPct(pct);

  const canExplain = Boolean(toast?.body) && typeof onToast === "function";
  const longPressMs = 420;
  const pressTimerIdRef = useRef(null);

  function showPinned() {
    if (!canExplain) return;
    onToast({ ...toast, pinned: true });
  }

  function startLongPress() {
    if (!canExplain) return;
    if (pressTimerIdRef.current) clearTimeout(pressTimerIdRef.current);
    pressTimerIdRef.current = setTimeout(() => {
      showPinned();
      pressTimerIdRef.current = null;
    }, longPressMs);
  }

  function cancelLongPress() {
    if (!pressTimerIdRef.current) return;
    clearTimeout(pressTimerIdRef.current);
    pressTimerIdRef.current = null;
  }

  function onKeyDown(e) {
    if (!canExplain) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      showPinned();
    }
  }

  return (
    <div
      className={`flex items-center gap-3 ${canExplain ? "cursor-pointer rounded-2xl px-2 py-2 hover:bg-slate-900/50" : ""}`}
      onClick={showPinned}
      onKeyDown={onKeyDown}
      onPointerDown={startLongPress}
      onPointerUp={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onContextMenu={canExplain ? (e) => e.preventDefault() : undefined}
      role={canExplain ? "button" : undefined}
      tabIndex={canExplain ? 0 : undefined}
    >
      <div className="w-40 shrink-0 text-xs font-medium text-zinc-200">
        {label}
      </div>
      <div className="flex-1">
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full ${barClass}`}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
      </div>
      <div className={`w-14 shrink-0 text-right text-xs font-semibold tabular-nums ${valueClass}`}>
        {pct.toFixed(1)}%
      </div>
      {Array.isArray(quotes) && quotes.length ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {quotes.slice(0, 3).map((q) => (
            <div key={`${q.label}-${q.value ?? "na"}`} className="rounded-md bg-slate-900 px-1.5 py-[2px] text-[11px] font-semibold text-zinc-300 ring-1 ring-slate-700">
              {q.label}: {Number.isFinite(q.value) ? q.value.toFixed(2) : "—"}
            </div>
          ))}
        </div>
      ) : null}
      {canExplain ? (
        <div className="shrink-0 text-xs font-semibold text-zinc-400">i</div>
      ) : null}
    </div>
  );
}
