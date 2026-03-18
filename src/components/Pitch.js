import Image from "next/image";
import { useMemo, useState } from "react";

export function Pitch({ title, starters, formation }) {
  const kk = Array.isArray(starters) ? starters : [];
  const withMeta = kk.map((p) =>
    typeof p === "string" ? { name: p } : { name: p?.name ?? "", position: p?.position ?? null, image: p?.image ?? null },
  );
  const gkIndex = withMeta.findIndex((p) =>
    String(p?.position ?? "").toUpperCase().includes("GK"),
  );
  const gk = gkIndex >= 0 ? withMeta[gkIndex] : withMeta[0] ?? null;
  const outfield = withMeta.filter((_, i) => i !== gkIndex && i !== 0);
  function parseFormation(s) {
    if (!s) return null;
    const parts = String(s).split("-").map((x) => Number.parseInt(String(x), 10)).filter((n) => Number.isFinite(n) && n > 0);
    return parts.length ? parts : null;
  }
  const shape = parseFormation(formation) ?? [4, 3, 3];
  const rows = [];
  rows.push([gk].filter(Boolean));
  let idx = 0;
  shape.forEach((n) => {
    const slice = outfield.slice(idx, idx + n);
    idx += n;
    rows.push(slice);
  });
  const bgStyle = useMemo(
    () => ({
      backgroundImage:
        "repeating-linear-gradient(90deg, rgba(4,120,87,0.45) 0 22px, rgba(6,95,70,0.45) 22px 44px)",
    }),
    [],
  );
  return (
    <div>
      {title ? <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">{title}</div> : null}
      <div className="relative h-[340px] w-full overflow-hidden rounded-2xl ring-1 ring-emerald-800" style={bgStyle}>
        <div className="pointer-events-none absolute inset-2 rounded-xl ring-2 ring-emerald-200/50" />
        <div className="pointer-events-none absolute inset-y-2 left-1/2 w-[2px] -translate-x-1/2 bg-emerald-200/50" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-emerald-200/50" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-200/60" />
        <div className="pointer-events-none absolute inset-y-16 left-2 w-20 rounded-r-xl ring-2 ring-emerald-200/50" />
        <div className="pointer-events-none absolute inset-y-16 right-2 w-20 rounded-l-xl ring-2 ring-emerald-200/50" />
        {!withMeta.length ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-xl bg-emerald-950/60 px-3 py-2 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-800">
              Alineación no disponible
            </div>
          </div>
        ) : null}
        <div className="absolute inset-0 grid grid-rows-5">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center justify-center">
              <div className="flex flex-wrap items-center justify-center gap-4 p-3">
                {r?.map((p) => {
                  const name = p?.name ?? "";
                  const image = p?.image ?? null;
                  const initials = String(name).trim().slice(0, 1).toUpperCase();
                  function PlayerAvatar({ name, initialSrc }) {
                    const [src, setSrc] = useState(initialSrc ?? null);
                    const [triedSofa, setTriedSofa] = useState(false);
                    async function handleError() {
                      if (triedSofa || !name) {
                        setSrc(null);
                        return;
                      }
                      setTriedSofa(true);
                      try {
                        const res = await fetch(`/api/sofa/player-image?name=${encodeURIComponent(name)}`);
                        const j = await res.json();
                        if (j?.imageUrl) {
                          setSrc(j.imageUrl);
                          return;
                        }
                      } catch (_e) {
                      }
                      setSrc(null);
                    }
                    return (
                      <div className="h-12 w-12 overflow-hidden rounded-full bg-emerald-950 ring-2 ring-emerald-200/60">
                        {src ? (
                          <Image
                            src={src}
                            alt={name}
                            width={48}
                            height={48}
                            className="h-full w-full object-cover"
                            onError={handleError}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm font-bold text-emerald-100">
                            {initials}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div key={name} className="flex w-24 flex-col items-center">
                      <PlayerAvatar name={name} initialSrc={image} />
                      <div className="mt-1 truncate text-[11px] font-semibold text-emerald-100">{name}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      {formation ? <div className="mt-2 text-[11px] text-zinc-400">Formación: {formation}</div> : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {withMeta.slice(0, 11).map((p) => (
          <div key={p.name} className="flex items-center gap-2 rounded-xl bg-slate-950/40 p-2 ring-1 ring-slate-800">
            <div className="h-8 w-8 overflow-hidden rounded-full bg-emerald-950 ring-1 ring-emerald-800">
              {p.image ? (
                <Image src={p.image} alt={p.name} width={32} height={32} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-bold text-emerald-100">
                  {String(p.name ?? "").slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <div className="truncate text-xs font-semibold text-zinc-100">{p.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
