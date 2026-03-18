"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function NavItem({ href, label }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={[
        "flex flex-1 items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold",
        active
          ? "bg-blue-600 text-white"
          : "text-zinc-200 hover:bg-slate-800",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

export function AppShell({ title, children }) {
  return (
    <div className="min-h-dvh bg-slate-950 text-zinc-50">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              RealSoccer IA
            </div>
            <h1 className="truncate text-base font-semibold">{title}</h1>
          </div>
          <div className="flex w-[240px] items-center gap-2 rounded-2xl bg-slate-900 p-1 shadow-sm ring-1 ring-slate-800">
            <NavItem href="/" label="Partidos" />
            <NavItem href="/metodologia" label="Método" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-4 pb-10">
        {children}
      </main>
    </div>
  );
}
