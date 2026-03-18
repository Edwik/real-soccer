"use client";

export function Section({ title, right, children }) {
  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
        {right ? <div className="text-xs text-zinc-400">{right}</div> : null}
      </div>
      <div className="rounded-2xl bg-slate-900/40 p-4 shadow-sm ring-1 ring-slate-800">
        {children}
      </div>
    </section>
  );
}
