"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { MatchCard } from "@/components/MatchCard";
import { Section } from "@/components/Section";
import { readCache, writeCache } from "@/lib/localCache";
import { useCachedJson } from "@/lib/useCachedJson";
import { getBogotaTodayISODate } from "@/lib/time";

function buildScheduledUrl(dateIso) {
  return `/api/sofa/scheduled?date=${encodeURIComponent(dateIso)}`;
}

function buildAnalyzeUrl(eventId) {
  return `/api/analyze?eventId=${encodeURIComponent(eventId)}`;
}

const EMPTY_EVENTS = [];
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function pickTotalsByLine(markets, line) {
  if (!markets?.totals) return null;
  const t = markets.totals.find((x) => x?.line === line) ?? null;
  if (!t) return null;
  return { over: t.over, under: t.under };
}

function buildCandidatesFromAnalysis({ analysis, event }) {
  const markets = analysis?.model?.markets ?? null;
  if (!markets) return [];

  const home = event?.homeTeam?.name ?? "Local";
  const away = event?.awayTeam?.name ?? "Visitante";
  const title = `${home} vs ${away}`;

  const candidates = [];

  function pushCandidate({ code, name, probability, why }) {
    if (!Number.isFinite(probability)) return;
    candidates.push({
      key: `${event.id}__${code}`,
      eventId: event.id,
      matchTitle: title,
      code,
      name,
      probability,
      why,
    });
  }

  pushCandidate({
    code: "WIN_HOME",
    name: `Gana ${home} (1)`,
    probability: markets?.oneXtwo?.home ?? null,
    why: "Sale de la probabilidad 1X2 del modelo (Poisson) según goles esperados.",
  });
  pushCandidate({
    code: "WIN_AWAY",
    name: `Gana ${away} (2)`,
    probability: markets?.oneXtwo?.away ?? null,
    why: "Sale de la probabilidad 1X2 del modelo (Poisson) según goles esperados.",
  });
  pushCandidate({
    code: "1X",
    name: `${home} no pierde (1X)`,
    probability: markets?.doubleChance?.["1X"] ?? null,
    why: "Cubre victoria local o empate según 1X2 del modelo.",
  });
  pushCandidate({
    code: "X2",
    name: `${away} no pierde (X2)`,
    probability: markets?.doubleChance?.X2 ?? null,
    why: "Cubre victoria visitante o empate según 1X2 del modelo.",
  });
  pushCandidate({
    code: "BTTS_NO",
    name: "Ambos anotan: NO",
    probability: markets?.btts?.no ?? null,
    why: "Probabilidad de que al menos uno se quede en 0, derivada de la matriz de marcadores.",
  });

  const u45 = pickTotalsByLine(markets, 4.5);
  if (u45) {
    pushCandidate({
      code: "U45",
      name: "Menos de 4.5 goles",
      probability: u45.under,
      why: "Probabilidad de que el total de goles sea < 4.5 según la matriz de marcadores.",
    });
  }

  const o15 = pickTotalsByLine(markets, 1.5);
  if (o15) {
    pushCandidate({
      code: "O15",
      name: "Más de 1.5 goles",
      probability: o15.over,
      why: "Probabilidad de que el total de goles sea > 1.5 según la matriz de marcadores.",
    });
  }

  return candidates;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker());
  await Promise.all(workers);
  return results;
}

export default function Home() {
  const [date, setDate] = useState(() => getBogotaTodayISODate());
  const [country, setCountry] = useState("all");
  const [league, setLeague] = useState("all");
  const url = useMemo(() => buildScheduledUrl(date), [date]);
  const scheduled = useCachedJson(url, { cacheKey: `scheduled:v4:${date}` });
  const events = scheduled.data?.events ?? EMPTY_EVENTS;
  const source = scheduled.data?.source ?? (scheduled.source === "cache" ? "cache" : "api");
  const [dayRecs, setDayRecs] = useState(() => ({
    loading: false,
    error: null,
    data: null,
    source: null,
  }));

  const countries = useMemo(() => {
    const set = new Set();
    events.forEach((e) => {
      const c = e?.tournament?.category;
      if (c) set.add(String(c));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [events]);

  const leagues = useMemo(() => {
    const set = new Set();
    events
      .filter((e) => (country === "all" ? true : String(e?.tournament?.category ?? "") === country))
      .forEach((e) => {
        const n = e?.tournament?.name;
        if (n) set.add(String(n));
      });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [events, country]);

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (country !== "all" && String(e?.tournament?.category ?? "") !== country) return false;
      if (league !== "all" && String(e?.tournament?.name ?? "") !== league) return false;
      return true;
    });
  }, [events, country, league]);

  async function generateDayRecommendations() {
    if (dayRecs.loading) return;
    if (!events.length) {
      setDayRecs({
        loading: false,
        error: new Error("No hay partidos para analizar en esta fecha."),
        data: null,
        source: null,
      });
      return;
    }

    const cacheKey = `dayrecs:${date}`;
    const cached = readCache(cacheKey);
    if (cached) {
      setDayRecs({ loading: false, error: null, data: cached, source: "cache" });
      return;
    }

    setDayRecs({ loading: true, error: null, data: null, source: null });

    try {
      const maxMatchesToAnalyze = 20;
      const toAnalyze = events.slice(0, maxMatchesToAnalyze);

      const analyses = await mapWithConcurrency(toAnalyze, 3, async (event) => {
        const res = await fetch(buildAnalyzeUrl(event.id));
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Error analizando ${event?.homeTeam?.name ?? ""} vs ${event?.awayTeam?.name ?? ""}: HTTP ${res.status} ${text}`);
        }
        const json = await res.json();
        return { event, analysis: json };
      });

      const threshold = 0.75;
      const allCandidates = analyses
        .flatMap(({ event, analysis }) => buildCandidatesFromAnalysis({ analysis, event }))
        .filter((c) => c.probability >= threshold)
        .sort((a, b) => b.probability - a.probability);

      const singles = [];
      const usedSingles = new Set();
      allCandidates.forEach((c) => {
        if (singles.length >= 3) return;
        const key = `${c.eventId}__${c.code}`;
        if (usedSingles.has(key)) return;
        usedSingles.add(key);
        singles.push(c);
      });

      function buildCombo(legsCount) {
        const legs = [];
        const usedEvents = new Set();
        allCandidates.forEach((c) => {
          if (legs.length >= legsCount) return;
          if (usedEvents.has(c.eventId)) return;
          usedEvents.add(c.eventId);
          legs.push(c);
        });
        if (legs.length < legsCount) return null;
        const combinedProbability = legs.reduce((acc, l) => acc * l.probability, 1);
        return { legsCount, legs, combinedProbability };
      }

      const combos = [buildCombo(2), buildCombo(3)].filter(Boolean);

      const payload = {
        date,
        analyzedMatches: toAnalyze.length,
        threshold,
        singles,
        combos,
      };

      writeCache(cacheKey, payload, THREE_DAYS_MS);
      setDayRecs({ loading: false, error: null, data: payload, source: "computed" });
    } catch (err) {
      setDayRecs({ loading: false, error: err, data: null, source: null });
    }
  }

  return (
    <AppShell title="Partidos del día">
      <Section
        title="Selecciona fecha"
        right={
          scheduled.loading
            ? "Cargando…"
            : scheduled.source === "cache"
              ? "Cache (3 días)"
              : "API"
        }
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
              Fecha (Bogotá GMT-5)
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setCountry("all");
                setLeague("all");
              }}
              className="h-12 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 shadow-sm outline-none ring-0 focus:border-zinc-400 dark:border-slate-800 dark:bg-slate-950 dark:text-zinc-50 dark:focus:border-slate-600"
            />
          </label>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
              País
            </span>
            <select
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                setLeague("all");
              }}
              className="h-12 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 shadow-sm outline-none ring-0 focus:border-zinc-400 dark:border-slate-800 dark:bg-slate-950 dark:text-zinc-50 dark:focus:border-slate-600"
            >
              <option value="all">Todos</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
              Liga / Competición
            </span>
            <select
              value={league}
              onChange={(e) => setLeague(e.target.value)}
              className="h-12 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 shadow-sm outline-none ring-0 focus:border-zinc-400 dark:border-slate-800 dark:bg-slate-950 dark:text-zinc-50 dark:focus:border-slate-600"
            >
              <option value="all">Todas</option>
              {leagues.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          Fuente:{" "}
          {source === "football-data"
            ? "football-data.org"
            : source === "sofascore"
              ? "SofaScore"
            : source === "sportsdb"
              ? "TheSportsDB"
              : source}
          . Si configuras FOOTBALL_DATA_TOKEN en el servidor, la app usará football-data.org.
        </div>

        {scheduled.error ? (
          <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-900 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-100 dark:ring-red-900/60">
            Error consultando partidos: {String(scheduled.error?.message ?? scheduled.error)}
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={generateDayRecommendations}
            disabled={scheduled.loading || dayRecs.loading || !events.length}
            className="h-12 w-full rounded-2xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm ring-1 ring-blue-500/40 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {dayRecs.loading ? "Calculando recomendaciones…" : "Recomendaciones del día"}
          </button>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            Genera picks con probabilidad ≥ 75% usando el modelo del análisis (Poisson).
          </div>
        </div>
      </Section>

      {dayRecs.error ? (
        <Section title="Recomendaciones del día">
          <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-900 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-100 dark:ring-red-900/60">
            Error generando recomendaciones: {String(dayRecs.error?.message ?? dayRecs.error)}
          </div>
        </Section>
      ) : dayRecs.data ? (
        <Section
          title="Recomendaciones del día"
          right={dayRecs.source === "cache" ? "Cache (3 días)" : "Calculado"}
        >
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            Analizados: {dayRecs.data.analyzedMatches} partido(s). Umbral:{" "}
            {(dayRecs.data.threshold * 100).toFixed(0)}% (por selección).
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-950/40 p-4 ring-1 ring-slate-800">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Seguras (1 partido)
              </div>
              <div className="mt-3 space-y-3">
                {dayRecs.data.singles?.length ? (
                  dayRecs.data.singles.map((p) => (
                    <div key={p.key} className="space-y-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{p.name}</div>
                          <div className="truncate text-xs text-zinc-400">{p.matchTitle}</div>
                        </div>
                        <div className="shrink-0 text-sm font-semibold tabular-nums">
                          {(p.probability * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div className="text-xs text-zinc-300">{p.why}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-zinc-300">
                    No se encontraron picks ≥ 75% para esta fecha con los partidos analizados.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-950/40 p-4 ring-1 ring-slate-800">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Combinadas (cuota más alta)
              </div>
              <div className="mt-3 space-y-4">
                {dayRecs.data.combos?.length ? (
                  dayRecs.data.combos.map((c) => (
                    <div key={c.legsCount} className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold">
                          Combinada de {c.legsCount} partido(s)
                        </div>
                        <div className="text-sm font-semibold tabular-nums">
                          Prob. conjunta {(c.combinedProbability * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div className="space-y-2">
                        {c.legs.map((p) => (
                          <div key={p.key} className="rounded-2xl bg-slate-900/40 p-3 ring-1 ring-slate-800/70">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold">{p.name}</div>
                                <div className="truncate text-xs text-zinc-400">{p.matchTitle}</div>
                              </div>
                              <div className="shrink-0 text-sm font-semibold tabular-nums">
                                {(p.probability * 100).toFixed(1)}%
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="text-xs text-zinc-300">
                        Cada selección cumple ≥ 75%. La probabilidad conjunta baja porque es el producto de todas.
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-zinc-300">
                    No hay suficientes selecciones ≥ 75% para armar combinadas.
                  </div>
                )}
              </div>
            </div>
          </div>
        </Section>
      ) : null}

      <Section title={`Partidos (${filteredEvents.length}${events.length !== filteredEvents.length ? ` de ${events.length}` : ""})`}>
        {scheduled.loading ? (
          <div className="text-sm text-zinc-600 dark:text-zinc-300">
            Cargando partidos…
          </div>
        ) : filteredEvents.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {filteredEvents.map((e) => (
              <MatchCard key={e.id} event={e} />
            ))}
          </div>
        ) : (
          <div className="text-sm text-zinc-600 dark:text-zinc-300">
            No hay partidos disponibles para esta fecha (o la API no devolvió eventos).
          </div>
        )}
      </Section>
    </AppShell>
  );
}
