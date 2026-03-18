"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AppShell } from "@/components/AppShell";
import { PercentRow } from "@/components/PercentRow";
import { Section } from "@/components/Section";
import { Pitch } from "@/components/Pitch";
import { useCachedJson } from "@/lib/useCachedJson";
import {
  formatBogotaDateFromUnixSeconds,
  formatBogotaTimeFromUnixSeconds,
} from "@/lib/time";

function formatShortDate(ts) {
  return formatBogotaDateFromUnixSeconds(ts) ?? "—";
}

function MatchMiniRow({ m }) {
  const place = m?.isHome ? "Casa" : m?.isAway ? "Visita" : "";
  const res = m?.result === "W" ? "G" : m?.result === "D" ? "E" : m?.result === "L" ? "P" : "—";
  const team = m?.teamName ?? (m?.isHome ? "Local" : m?.isAway ? "Visitante" : "Equipo");
  const opp = m?.opponentName ?? "Rival";
  const teamLogo = m?.teamLogo ?? null;
  const oppLogo = m?.opponentLogo ?? null;
  const score =
    Number.isFinite(m?.goalsFor) && Number.isFinite(m?.goalsAgainst)
      ? `${m.goalsFor}-${m.goalsAgainst}`
      : "—";
  const colorClass =
    m?.result === "W" ? "text-emerald-400" : m?.result === "L" ? "text-rose-400" : "text-zinc-300";
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-950/40 px-3 py-2 text-xs ring-1 ring-slate-800">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {teamLogo ? (
            <Image src={teamLogo} alt={team} width={18} height={18} className="h-[18px] w-[18px] object-contain" />
          ) : null}
          <div className="truncate font-semibold">{team}</div>
          <div className="text-[10px] text-zinc-500">vs</div>
          {oppLogo ? (
            <Image src={oppLogo} alt={opp} width={18} height={18} className="h-[18px] w-[18px] object-contain" />
          ) : null}
          <div className="truncate font-semibold">{opp}</div>
        </div>
        <div className="truncate text-[11px] text-zinc-400">
          {formatShortDate(m?.startTimestamp)} · {place} · {m?.tournament ?? "—"}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className={`text-lg font-extrabold tabular-nums ${colorClass}`}>{score}</div>
        <div className="text-[11px] text-zinc-400">{res}</div>
      </div>
    </div>
  );
}

function buildAnalyzeUrl(eventId) {
  if (!eventId) return null;
  return `/api/analyze?eventId=${encodeURIComponent(eventId)}`;
}

function buildEventDetailsUrl(eventId) {
  if (!eventId) return null;
  return `/api/sofa/event/${encodeURIComponent(eventId)}`;
}

function StatPill({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-950/40 px-3 py-2 text-xs ring-1 ring-slate-800">
      <div className="text-zinc-400">{label}</div>
      <div className="font-semibold tabular-nums">{value ?? "—"}</div>
    </div>
  );
}

function JsonBox({ value }) {
  return (
    <pre className="max-h-[420px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-zinc-100 ring-1 ring-slate-800">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function extractLogosFromEventDetails(eventDetails) {
  const data = eventDetails?.data ?? null;
  const source = data?.source ?? null;
  const event = data?.event ?? null;

  // Logos
  if (source === "espn") {
    const competitors = Array.isArray(event?.competitors) ? event.competitors : [];
    const home = competitors.find((c) => c?.homeAway === "home") ?? null;
    const away = competitors.find((c) => c?.homeAway === "away") ?? null;
    return {
      homeLogo:
        home?.team?.logo ??
        (Array.isArray(home?.team?.logos) ? home.team.logos[0]?.href ?? null : null),
      awayLogo:
        away?.team?.logo ??
        (Array.isArray(away?.team?.logos) ? away.team.logos[0]?.href ?? null : null),
    };
  }

  if (source === "football-data") {
    return {
      homeLogo: event?.homeTeam?.crest ?? null,
      awayLogo: event?.awayTeam?.crest ?? null,
    };
  }

  if (source === "sofascore") {
    return {
      homeLogo: event?.homeTeam?.logo ?? event?.homeTeam?.badge ?? null,
      awayLogo: event?.awayTeam?.logo ?? event?.awayTeam?.badge ?? null,
    };
  }

  if (source === "sportsdb") {
    return {
      homeLogo: event?.strHomeTeamBadge ?? null,
      awayLogo: event?.strAwayTeamBadge ?? null,
    };
  }

  return { homeLogo: null, awayLogo: null };
}

function extractLineupsAndAbsences(eventDetails, { homeTeamId, awayTeamId }) {
  const data = eventDetails?.data ?? null;
  const source = data?.source ?? null;
  const lineups = data?.lineups ?? null;
  const event = data?.event ?? null;

  function normalizeEntries(container) {
    const entries = Array.isArray(container?.roster)
      ? container.roster
      : Array.isArray(container?.entries)
        ? container.entries
        : Array.isArray(container)
          ? container
          : [];
    const starters = [];
    const bench = [];
    const unavailable = [];
    entries.forEach((e) => {
      const athlete =
        e?.athlete ??
        e?.player ??
        null;
      const name =
        e?.athlete?.displayName ??
        e?.athlete?.name ??
        e?.name ??
        e?.player?.displayName ??
        null;
      const position =
        e?.position?.abbreviation ??
        e?.position?.name ??
        athlete?.position?.abbreviation ??
        athlete?.position?.name ??
        null;
      const athleteId = athlete?.id ?? e?.playerId ?? null;
      let image =
        e?.athlete?.headshot?.href ??
        e?.athlete?.images?.[0]?.href ??
        e?.player?.images?.[0]?.href ??
        null;
      if (!image && athleteId) {
        image = `https://a.espncdn.com/i/headshots/soccer/players/full/${encodeURIComponent(
          String(athleteId),
        )}.png`;
      }
      const starter = Boolean(e?.starter);
      const statusRaw =
        (e?.status?.type ?? e?.injuryStatus ?? e?.availability ?? "")
          .toString()
          .toUpperCase();
      const reason =
        e?.status?.details ??
        e?.status?.description ??
        (statusRaw || null);
      const notActive = Boolean(e?.notActive);
      const isUnavailable =
        notActive ||
        /INJ|SUSP|RED|DISC|UNAVAIL/.test(statusRaw);
      if (!name) return;
      if (isUnavailable) {
        unavailable.push({ name, reason });
      } else if (starter) {
        starters.push({ name, position, image });
      } else {
        bench.push(name);
      }
    });
    return { starters, bench, unavailable };
  }

  function blank() {
    return { starters: [], bench: [], unavailable: [] };
  }

  const result = { home: blank(), away: blank() };

  if (source === "espn") {
    const teams =
      Array.isArray(lineups?.teams) ? lineups.teams : Array.isArray(lineups) ? lineups : [];
    const homeObj =
      teams.find((t) => String(t?.team?.id ?? t?.teamId ?? "") === String(homeTeamId)) ??
      lineups?.home ??
      null;
    const awayObj =
      teams.find((t) => String(t?.team?.id ?? t?.teamId ?? "") === String(awayTeamId)) ??
      lineups?.away ??
      null;
    if (homeObj) result.home = normalizeEntries(homeObj);
    if (awayObj) result.away = normalizeEntries(awayObj);
    return result;
  }

  if (source === "sofascore") {
    const homeObj = lineups?.home ?? lineups?.teamHome ?? null;
    const awayObj = lineups?.away ?? lineups?.teamAway ?? null;
    if (homeObj) result.home = normalizeEntries(homeObj);
    if (awayObj) result.away = normalizeEntries(awayObj);
    return result;
  }

  return result;
}

function extractFormations(eventDetails) {
  const data = eventDetails?.data ?? null;
  const source = data?.source ?? null;
  const event = data?.event ?? null;
  const lineups = data?.lineups ?? null;
  let home = null;
  let away = null;
  if (source === "espn") {
    const comps = Array.isArray(event?.competitors) ? event.competitors : [];
    const h = comps.find((c) => c?.homeAway === "home") ?? null;
    const a = comps.find((c) => c?.homeAway === "away") ?? null;
    home =
      h?.formation ??
      h?.formations?.[0]?.abbreviation ??
      h?.formations?.[0]?.text ??
      null;
    away =
      a?.formation ??
      a?.formations?.[0]?.abbreviation ??
      a?.formations?.[0]?.text ??
      null;
    return { home, away };
  }
  if (source === "sofascore") {
    home = lineups?.home?.formation ?? lineups?.teamHome?.formation ?? null;
    away = lineups?.away?.formation ?? lineups?.teamAway?.formation ?? null;
    return { home, away };
  }
  return { home: null, away: null };
}

function buildModelSummary({ home, away, expectedGoals, markets }) {
  const lambdaHome =
    markets?.inputs?.lambdaHome ?? expectedGoals?.lambdaHome ?? null;
  const lambdaAway =
    markets?.inputs?.lambdaAway ?? expectedGoals?.lambdaAway ?? null;
  const maxGoals = markets?.inputs?.maxGoals ?? null;

  const samples = expectedGoals?.inputs ?? null;
  const homePlayed = samples?.homeHomePlayed ?? null;
  const awayPlayed = samples?.awayAwayPlayed ?? null;
  const priorWeightMatches = samples?.priorWeightMatches ?? null;
  const priorMean = samples?.priorMean ?? null;

  return {
    lambdaHome,
    lambdaAway,
    maxGoals,
    homePlayed,
    awayPlayed,
    priorWeightMatches,
    priorMean,
    home,
    away,
  };
}

function fmtNum(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(decimals);
}

function buildToastBodyBase(summary) {
  const maxGoalsText =
    Number.isFinite(summary.maxGoals) ? String(summary.maxGoals) : "6";

  const lambdaText =
    summary.lambdaHome !== null && summary.lambdaAway !== null
      ? `λ local=${fmtNum(summary.lambdaHome, 3)} · λ visitante=${fmtNum(summary.lambdaAway, 3)}`
      : "λ no disponible";

  const sampleText =
    summary.homePlayed !== null && summary.awayPlayed !== null
      ? `Muestras: ${summary.home} en casa ${summary.homePlayed} · ${summary.away} fuera ${summary.awayPlayed}`
      : "Muestras no disponibles";

  const shrinkText =
    summary.priorWeightMatches !== null && summary.priorMean !== null
      ? `Ajuste por poca muestra: prior=${fmtNum(summary.priorMean, 2)} con peso ${summary.priorWeightMatches} partidos.`
      : "Ajuste por poca muestra no disponible.";

  return [
    "Modelo: Poisson independiente por equipo.",
    lambdaText,
    sampleText,
    shrinkText,
    `Se construye una matriz de marcadores 0–${maxGoalsText} y se suman las celdas que cumplen la condición del mercado.`,
    "El % mostrado es probabilidad×100 y puede verse redondeado.",
  ].join("\n");
}

function buildToastForMarket({ summary, kind, line }) {
  const base = buildToastBodyBase(summary);
  const tLine =
    typeof line === "number" && Number.isFinite(line) ? line : null;

  if (kind === "1") {
    return {
      title: "1 (Local)",
      body: `${base}\n\n1 (Local) = suma P(H>A) en la matriz.`,
    };
  }
  if (kind === "X") {
    return {
      title: "X (Empate)",
      body: `${base}\n\nX (Empate) = suma P(H=A) en la matriz.`,
    };
  }
  if (kind === "2") {
    return {
      title: "2 (Visitante)",
      body: `${base}\n\n2 (Visitante) = suma P(H<A) en la matriz.`,
    };
  }
  if (kind === "1X") {
    return {
      title: "1X (Doble oportunidad)",
      body: `${base}\n\n1X = P(H>A) + P(H=A).`,
    };
  }
  if (kind === "X2") {
    return {
      title: "X2 (Doble oportunidad)",
      body: `${base}\n\nX2 = P(H<A) + P(H=A).`,
    };
  }
  if (kind === "12") {
    return {
      title: "12 (Doble oportunidad)",
      body: `${base}\n\n12 = P(H>A) + P(H<A) = 1 - P(H=A).`,
    };
  }
  if (kind === "BTTS_YES") {
    return {
      title: "Ambos anotan: Sí",
      body: `${base}\n\nBTTS Sí = suma P(H>0 y A>0). En el modelo también puede verse como 1 - P(H=0) - P(A=0) + P(0-0).`,
    };
  }
  if (kind === "BTTS_NO") {
    return {
      title: "Ambos anotan: No",
      body: `${base}\n\nBTTS No = 1 - BTTS Sí = suma P(H=0 o A=0).`,
    };
  }
  if (kind === "TOTAL_OVER") {
    return {
      title: tLine !== null ? `Más de ${tLine}` : "Más de (totales)",
      body: `${base}\n\nMás de ${tLine} = suma P(H+A > ${tLine}).`,
    };
  }
  if (kind === "TOTAL_UNDER") {
    return {
      title: tLine !== null ? `Menos de ${tLine}` : "Menos de (totales)",
      body: `${base}\n\nMenos de ${tLine} = suma P(H+A < ${tLine}).`,
    };
  }
  if (kind === "HCP_HOME") {
    return {
      title: tLine !== null ? `${summary.home} cubre ${tLine}` : `${summary.home} cubre`,
      body: `${base}\n\n${summary.home} cubre ${tLine} = suma P(H-A > ${tLine}).`,
    };
  }
  if (kind === "HCP_AWAY") {
    return {
      title: tLine !== null ? `${summary.away} cubre ${tLine}` : `${summary.away} cubre`,
      body: `${base}\n\n${summary.away} cubre ${tLine} = 1 - P(${summary.home} cubre ${tLine}).`,
    };
  }
  return { title: null, body: null };
}

function Toast({ toast, onClose }) {
  if (!toast?.open) return null;
  return (
    <div className="fixed inset-x-0 bottom-4 z-50 mx-auto max-w-xl px-4">
      <div className="rounded-3xl bg-slate-950/95 p-4 text-zinc-100 shadow-xl ring-1 ring-slate-800 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{toast.title ?? "Detalle"}</div>
            <div className="mt-2 whitespace-pre-line text-xs leading-relaxed text-zinc-200">
              {toast.body}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-2xl bg-slate-900 px-3 py-2 text-xs font-semibold text-zinc-100 ring-1 ring-slate-800 hover:bg-slate-800"
          >
            Cerrar
          </button>
        </div>
        {toast.pinned ? (
          <div className="mt-2 text-[11px] text-zinc-400">
            Fijado: toca “Cerrar” para ocultarlo.
          </div>
        ) : (
          <div className="mt-2 text-[11px] text-zinc-400">
            Pasa el mouse para ver más; toca una métrica para fijar el detalle.
          </div>
        )}
      </div>
    </div>
  );
}

export function MatchClient({ eventId }) {
  const analyzeUrl = useMemo(() => buildAnalyzeUrl(eventId), [eventId]);
  const eventUrl = useMemo(() => buildEventDetailsUrl(eventId), [eventId]);

  const analysis = useCachedJson(analyzeUrl, {
    cacheKey: eventId ? `analyze:${eventId}` : null,
  });
  const eventDetails = useCachedJson(eventUrl, {
    cacheKey: eventId ? `event:${eventId}` : null,
  });

  const event = analysis.data?.event ?? null;
  const markets = analysis.data?.model?.markets ?? null;
  const rec = analysis.data?.model?.recommendations ?? null;
  const explanations = analysis.data?.model?.explanations ?? [];
  const expectedGoals = analysis.data?.model?.expectedGoals ?? null;

  const home = event?.homeTeam?.name ?? "Local";
  const away = event?.awayTeam?.name ?? "Visitante";

  const homeLast = analysis.data?.samples?.homeLast ?? analysis.data?.samples?.homeLast10 ?? [];
  const awayLast = analysis.data?.samples?.awayLast ?? analysis.data?.samples?.awayLast10 ?? [];
  const lastCount = analysis.data?.samples?.lastCount ?? 10;

  const { homeLogo, awayLogo } = useMemo(
    () => extractLogosFromEventDetails(eventDetails),
    [eventDetails],
  );
  const lineups = useMemo(() => {
    const homeId = analysis.data?.event?.homeTeam?.id ?? null;
    const awayId = analysis.data?.event?.awayTeam?.id ?? null;
    return extractLineupsAndAbsences(eventDetails, { homeTeamId: homeId, awayTeamId: awayId });
  }, [analysis.data?.event?.homeTeam?.id, analysis.data?.event?.awayTeam?.id, eventDetails]);
  const formations = useMemo(() => extractFormations(eventDetails), [eventDetails]);

  const whenDate = formatBogotaDateFromUnixSeconds(event?.startTimestamp);
  const whenTime = formatBogotaTimeFromUnixSeconds(event?.startTimestamp);

  const title =
    analysis.loading || !event ? "Análisis del partido" : `${home} vs ${away}`;

  const modelSummary = useMemo(
    () => buildModelSummary({ home, away, expectedGoals, markets }),
    [home, away, expectedGoals, markets],
  );

  const odds = useCachedJson(eventId ? `/api/odds/${eventId}` : null, {
    cacheKey: eventId ? `odds:${eventId}` : null,
  });
  function chipsFromTop(arr) {
    if (!Array.isArray(arr) || !arr.length) return [];
    return arr.map((x) => ({ label: x.book, value: x.price }));
  }
  function quotes1x2(sel) {
    const top = odds.data?.tops?.h2h?.[sel] ?? null;
    if (top) return chipsFromTop(top);
    return [];
  }
  function quotesBtts(sel) {
    const top = odds.data?.tops?.btts?.[sel] ?? null;
    if (top) return chipsFromTop(top);
    return [];
  }
  function quotesTotals(line, sel) {
    const keyLine = String(Number(line));
    const top = odds.data?.tops?.totals?.[keyLine]?.[sel] ?? null;
    if (top) return chipsFromTop(top);
    return [];
  }

  const [toast, setToast] = useState(() => ({
    open: false,
    title: null,
    body: null,
    pinned: false,
    key: null,
  }));

  useEffect(() => {
    if (!toast.open) return undefined;
    if (toast.pinned) return undefined;
    const t = setTimeout(() => {
      setToast((prev) => (prev.open && !prev.pinned ? { ...prev, open: false } : prev));
    }, 3200);
    return () => clearTimeout(t);
  }, [toast.open, toast.pinned, toast.key]);

  function onToast(payload) {
    if (!payload?.body) return;
    setToast({
      open: true,
      title: payload.title ?? "Detalle",
      body: payload.body,
      pinned: Boolean(payload.pinned),
      key: payload.key ?? null,
    });
  }

  function closeToast() {
    setToast((prev) => ({ ...prev, open: false, pinned: false }));
  }

  return (
    <AppShell title={title}>
      <Toast toast={toast} onClose={closeToast} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-semibold text-zinc-50 shadow-sm hover:bg-slate-800"
        >
          Volver
        </Link>
        <div className="text-xs text-zinc-400">
          {analysis.loading
            ? "Cargando…"
            : analysis.source === "cache"
              ? "Cache (3 días)"
              : "API"}
        </div>
      </div>

      {analysis.error ? (
        <Section title="Error">
          <div className="text-sm text-red-700 dark:text-red-200">
            Error generando análisis:{" "}
            {String(analysis.error?.message ?? analysis.error)}
          </div>
        </Section>
      ) : null}

      <Section
        title="Partido"
        right={
          whenDate && whenTime ? `${whenDate} · ${whenTime}` : null
        }
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-2xl bg-slate-950/40 p-4 ring-1 ring-slate-800">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Local
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-11 w-11 overflow-hidden rounded-3xl bg-slate-950/40 ring-1 ring-slate-800">
                {homeLogo ? (
                  <Image
                    src={homeLogo}
                    alt={home}
                    width={44}
                    height={44}
                    className="h-full w-full object-contain p-2"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm font-bold text-zinc-100">
                    {String(home).trim().slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate text-lg font-semibold">{home}</div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl bg-slate-950/40 p-4 ring-1 ring-slate-800">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Visitante
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-11 w-11 overflow-hidden rounded-3xl bg-slate-950/40 ring-1 ring-slate-800">
                {awayLogo ? (
                  <Image
                    src={awayLogo}
                    alt={away}
                    width={44}
                    height={44}
                    className="h-full w-full object-contain p-2"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm font-bold text-zinc-100">
                    {String(away).trim().slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate text-lg font-semibold">{away}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatPill label="Torneo" value={event?.tournament?.name ?? "—"} />
          <StatPill label="Categoría" value={event?.tournament?.category ?? "—"} />
          <StatPill label="Ronda" value={event?.stage?.round ?? "—"} />
          <StatPill label="Ida/Vuelta" value={event?.stage?.leg ?? "—"} />
        </div>
      </Section>

      <Section title="Alineación en campo">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Pitch title={home} starters={lineups.home.starters} formation={formations.home} />
          <Pitch title={away} starters={lineups.away.starters} formation={formations.away} />
        </div>
      </Section>

      <Section title="Forma (últimos partidos)">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-2xl bg-slate-950/40 p-4 ring-1 ring-slate-800">
            <div className="text-sm font-semibold">{home}</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <StatPill
                label="PJ"
                value={analysis.data?.samples?.homeSummary?.played ?? "—"}
              />
              <StatPill
                label="PPG"
                value={analysis.data?.samples?.homeSummary?.ppg ?? "—"}
              />
              <StatPill
                label="W-D-L"
                value={
                  analysis.data?.samples?.homeSummary
                    ? `${analysis.data.samples.homeSummary.w}-${analysis.data.samples.homeSummary.d}-${analysis.data.samples.homeSummary.l}`
                    : "—"
                }
              />
              <StatPill
                label="GF/GA"
                value={
                  analysis.data?.samples?.homeSummary
                    ? `${analysis.data.samples.homeSummary.gfAvg}/${analysis.data.samples.homeSummary.gaAvg}`
                    : "—"
                }
              />
            </div>
          </div>

          <div className="rounded-2xl bg-slate-950/40 p-4 ring-1 ring-slate-800">
            <div className="text-sm font-semibold">{away}</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <StatPill
                label="PJ"
                value={analysis.data?.samples?.awaySummary?.played ?? "—"}
              />
              <StatPill
                label="PPG"
                value={analysis.data?.samples?.awaySummary?.ppg ?? "—"}
              />
              <StatPill
                label="W-D-L"
                value={
                  analysis.data?.samples?.awaySummary
                    ? `${analysis.data.samples.awaySummary.w}-${analysis.data.samples.awaySummary.d}-${analysis.data.samples.awaySummary.l}`
                    : "—"
                }
              />
              <StatPill
                label="GF/GA"
                value={
                  analysis.data?.samples?.awaySummary
                    ? `${analysis.data.samples.awaySummary.gfAvg}/${analysis.data.samples.awaySummary.gaAvg}`
                    : "—"
                }
              />
            </div>
          </div>
        </div>
      </Section>

      <Section title={`Últimos ${lastCount} partidos`}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-2xl bg-slate-950/40 p-4 ring-1 ring-slate-800">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {home}
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-sm font-semibold text-zinc-100">
                Ver/ocultar
              </summary>
              <div className="mt-2 space-y-2">
                {Array.isArray(homeLast) && homeLast.length ? (
                  homeLast.map((m) => <MatchMiniRow key={`${m.eventId}-${m.startTimestamp}`} m={m} />)
                ) : (
                  <div className="text-sm text-zinc-300">No disponible.</div>
                )}
              </div>
            </details>
          </div>
          <div className="rounded-2xl bg-slate-950/40 p-4 ring-1 ring-slate-800">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {away}
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-sm font-semibold text-zinc-100">
                Ver/ocultar
              </summary>
              <div className="mt-2 space-y-2">
                {Array.isArray(awayLast) && awayLast.length ? (
                  awayLast.map((m) => <MatchMiniRow key={`${m.eventId}-${m.startTimestamp}`} m={m} />)
                ) : (
                  <div className="text-sm text-zinc-300">No disponible.</div>
                )}
              </div>
            </details>
          </div>
        </div>
      </Section>

      {analysis.data?.standings?.available ? (
        <Section title="Tabla / Clasificación">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-950/40 p-4 ring-1 ring-slate-800">
              <div className="text-sm font-semibold">{home}</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <StatPill
                  label="Posición"
                  value={analysis.data?.standings?.home?.position ?? "—"}
                />
                <StatPill
                  label="Puntos"
                  value={analysis.data?.standings?.home?.points ?? "—"}
                />
                <StatPill
                  label="Zona"
                  value={analysis.data?.standings?.home?.promotionText ?? "—"}
                />
                <StatPill
                  label="PJ"
                  value={analysis.data?.standings?.home?.matches ?? "—"}
                />
              </div>
            </div>
            <div className="rounded-2xl bg-slate-950/40 p-4 ring-1 ring-slate-800">
              <div className="text-sm font-semibold">{away}</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <StatPill
                  label="Posición"
                  value={analysis.data?.standings?.away?.position ?? "—"}
                />
                <StatPill
                  label="Puntos"
                  value={analysis.data?.standings?.away?.points ?? "—"}
                />
                <StatPill
                  label="Zona"
                  value={analysis.data?.standings?.away?.promotionText ?? "—"}
                />
                <StatPill
                  label="PJ"
                  value={analysis.data?.standings?.away?.matches ?? "—"}
                />
              </div>
            </div>
          </div>
        </Section>
      ) : null}

      <Section title="Probabilidades (mercados)">
        {!markets ? (
          <div className="text-sm text-zinc-300">
            Calculando probabilidades…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-slate-950/40 p-4 ring-1 ring-slate-800">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  1X2
                </div>
                <div className="mt-3 space-y-2">
                  <PercentRow
                    label="1 (Local)"
                    valuePct={markets.pretty.oneXtwoPct.home}
                    toast={{
                      key: "1X2_HOME",
                      ...buildToastForMarket({ summary: modelSummary, kind: "1" }),
                    }}
                    onToast={onToast}
                    quotes={quotes1x2("home")}
                  />
                  <PercentRow
                    label="X (Empate)"
                    valuePct={markets.pretty.oneXtwoPct.draw}
                    toast={{
                      key: "1X2_DRAW",
                      ...buildToastForMarket({ summary: modelSummary, kind: "X" }),
                    }}
                    onToast={onToast}
                    quotes={quotes1x2("draw")}
                  />
                  <PercentRow
                    label="2 (Visitante)"
                    valuePct={markets.pretty.oneXtwoPct.away}
                    toast={{
                      key: "1X2_AWAY",
                      ...buildToastForMarket({ summary: modelSummary, kind: "2" }),
                    }}
                    onToast={onToast}
                    quotes={quotes1x2("away")}
                  />
                </div>
              </div>

              <div className="rounded-2xl bg-slate-950/40 p-4 ring-1 ring-slate-800">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Doble oportunidad
                </div>
                <div className="mt-3 space-y-2">
                  <PercentRow
                    label="1X"
                    valuePct={markets.pretty.doubleChancePct["1X"]}
                    toast={{
                      key: "DC_1X",
                      ...buildToastForMarket({ summary: modelSummary, kind: "1X" }),
                    }}
                    onToast={onToast}
                  />
                  <PercentRow
                    label="X2"
                    valuePct={markets.pretty.doubleChancePct.X2}
                    toast={{
                      key: "DC_X2",
                      ...buildToastForMarket({ summary: modelSummary, kind: "X2" }),
                    }}
                    onToast={onToast}
                  />
                  <PercentRow
                    label="12"
                    valuePct={markets.pretty.doubleChancePct["12"]}
                    toast={{
                      key: "DC_12",
                      ...buildToastForMarket({ summary: modelSummary, kind: "12" }),
                    }}
                    onToast={onToast}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-950/40 p-4 ring-1 ring-slate-800">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Ambos anotan (BTTS)
              </div>
              <div className="mt-3 space-y-2">
                <PercentRow
                  label="Sí"
                  valuePct={markets.pretty.bttsPct.yes}
                  toast={{
                    key: "BTTS_YES",
                    ...buildToastForMarket({ summary: modelSummary, kind: "BTTS_YES" }),
                  }}
                  onToast={onToast}
                  quotes={quotesBtts("yes")}
                />
                <PercentRow
                  label="No"
                  valuePct={markets.pretty.bttsPct.no}
                  toast={{
                    key: "BTTS_NO",
                    ...buildToastForMarket({ summary: modelSummary, kind: "BTTS_NO" }),
                  }}
                  onToast={onToast}
                  quotes={quotesBtts("no")}
                />
              </div>
            </div>
          </div>
        )}
      </Section>

      {markets ? (
        <Section title="Totales (más/menos goles)">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {markets.totals.map((t) => (
              <div
                key={t.line}
                className="rounded-2xl bg-slate-950/40 p-4 ring-1 ring-slate-800"
              >
                <div className="text-sm font-semibold">Línea {t.line}</div>
                <div className="mt-3 space-y-2">
                  <PercentRow
                    label={`Más de ${t.line}`}
                    valuePct={t.over * 100}
                    toast={{
                      key: `TOTAL_OVER_${t.line}`,
                      ...buildToastForMarket({
                        summary: modelSummary,
                        kind: "TOTAL_OVER",
                        line: t.line,
                      }),
                    }}
                    onToast={onToast}
                    quotes={quotesTotals(t.line, "over")}
                  />
                  <PercentRow
                    label={`Menos de ${t.line}`}
                    valuePct={t.under * 100}
                    toast={{
                      key: `TOTAL_UNDER_${t.line}`,
                      ...buildToastForMarket({
                        summary: modelSummary,
                        kind: "TOTAL_UNDER",
                        line: t.line,
                      }),
                    }}
                    onToast={onToast}
                    quotes={quotesTotals(t.line, "under")}
                  />
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Alineaciones y bajas">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {(() => {
            const homeId = analysis.data?.event?.homeTeam?.id ?? null;
            const awayId = analysis.data?.event?.awayTeam?.id ?? null;
            const lineups = extractLineupsAndAbsences(eventDetails, {
              homeTeamId: homeId,
              awayTeamId: awayId,
            });
            return (
              <>
                <div className="rounded-2xl bg-slate-950/40 p-4 ring-1 ring-slate-800">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    {home}
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-semibold text-zinc-100">
                      Alineación prevista
                    </summary>
                    <div className="mt-2 space-y-1 text-sm">
                      {lineups.home.starters.length ? (
                        lineups.home.starters.map((p) => (
                          <div key={p.name} className="truncate">{p.name}</div>
                        ))
                      ) : (
                        <div className="text-zinc-300">No disponible.</div>
                      )}
                    </div>
                  </details>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-semibold text-zinc-100">
                      Suplentes
                    </summary>
                    <div className="mt-2 space-y-1 text-sm">
                      {lineups.home.bench.length ? (
                        lineups.home.bench.map((n) => (
                          <div key={n} className="truncate">{n}</div>
                        ))
                      ) : (
                        <div className="text-zinc-300">No disponible.</div>
                      )}
                    </div>
                  </details>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-semibold text-zinc-100">
                      No convocados / lesiones / sanciones
                    </summary>
                    <div className="mt-2 space-y-1 text-sm">
                      {lineups.home.unavailable.length ? (
                        lineups.home.unavailable.map((u) => (
                          <div key={`${u.name}-${u.reason ?? ""}`} className="truncate">
                            {u.name}{u.reason ? ` · ${u.reason}` : ""}
                          </div>
                        ))
                      ) : (
                        <div className="text-zinc-300">No hay reportes.</div>
                      )}
                    </div>
                  </details>
                </div>
                <div className="rounded-2xl bg-slate-950/40 p-4 ring-1 ring-slate-800">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    {away}
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-semibold text-zinc-100">
                      Alineación prevista
                    </summary>
                    <div className="mt-2 space-y-1 text-sm">
                      {lineups.away.starters.length ? (
                        lineups.away.starters.map((p) => (
                          <div key={p.name} className="truncate">{p.name}</div>
                        ))
                      ) : (
                        <div className="text-zinc-300">No disponible.</div>
                      )}
                    </div>
                  </details>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-semibold text-zinc-100">
                      Suplentes
                    </summary>
                    <div className="mt-2 space-y-1 text-sm">
                      {lineups.away.bench.length ? (
                        lineups.away.bench.map((n) => (
                          <div key={n} className="truncate">{n}</div>
                        ))
                      ) : (
                        <div className="text-zinc-300">No disponible.</div>
                      )}
                    </div>
                  </details>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-semibold text-zinc-100">
                      No convocados / lesiones / sanciones
                    </summary>
                    <div className="mt-2 space-y-1 text-sm">
                      {lineups.away.unavailable.length ? (
                        lineups.away.unavailable.map((u) => (
                          <div key={`${u.name}-${u.reason ?? ""}`} className="truncate">
                            {u.name}{u.reason ? ` · ${u.reason}` : ""}
                          </div>
                        ))
                      ) : (
                        <div className="text-zinc-300">No hay reportes.</div>
                      )}
                    </div>
                  </details>
                </div>
              </>
            );
          })()}
        </div>
        <div className="mt-3 text-[11px] text-zinc-400">
          Nota: Si hay titulares ausentes reportados, el modelo reduce ligeramente la λ del equipo afectado.
        </div>
      </Section>

      {markets ? (
        <Section title="Handicap (diferencia de goles)">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {markets.handicaps.map((h) => (
              <div
                key={h.line}
                className="rounded-2xl bg-slate-950/40 p-4 ring-1 ring-slate-800"
              >
                <div className="text-sm font-semibold">Línea {h.line}</div>
                <div className="mt-3 space-y-2">
                  <PercentRow
                    label={`${home} cubre`}
                    valuePct={h.homeCover * 100}
                    toast={{
                      key: `HCP_HOME_${h.line}`,
                      ...buildToastForMarket({
                        summary: modelSummary,
                        kind: "HCP_HOME",
                        line: h.line,
                      }),
                    }}
                    onToast={onToast}
                  />
                  <PercentRow
                    label={`${away} cubre`}
                    valuePct={h.awayCover * 100}
                    toast={{
                      key: `HCP_AWAY_${h.line}`,
                      ...buildToastForMarket({
                        summary: modelSummary,
                        kind: "HCP_AWAY",
                        line: h.line,
                      }),
                    }}
                    onToast={onToast}
                  />
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {rec ? (
        <Section title="Recomendaciones">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-950/40 p-4 ring-1 ring-slate-800">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Seguras (alta prob.)
              </div>
              <div className="mt-3 space-y-3">
                {rec.safe.length ? (
                  rec.safe.map((c) => (
                    <div key={c.code} className="space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold">{c.name}</div>
                        <div className="text-sm font-semibold tabular-nums">
                          {(c.probability * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div className="text-xs text-zinc-300">
                        {c.rationale}{" "}
                        {expectedGoals?.lambdaHome !== null && expectedGoals?.lambdaAway !== null
                          ? `Este porcentaje sale de un modelo Poisson con goles esperados (λ) ${home}=${expectedGoals.lambdaHome} y ${away}=${expectedGoals.lambdaAway}, calculado con los últimos partidos finalizados (local en casa y visitante fuera).`
                          : "Este porcentaje sale de un modelo Poisson basado en los últimos partidos finalizados (local en casa y visitante fuera)."}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-zinc-300">
                    No hay picks con umbral alto para este partido.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-950/40 p-4 ring-1 ring-slate-800">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Cuota alta (prob. media)
              </div>
              <div className="mt-3 space-y-3">
                {rec.high.length ? (
                  rec.high.map((c) => (
                    <div key={c.code} className="space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold">{c.name}</div>
                        <div className="text-sm font-semibold tabular-nums">
                          {(c.probability * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div className="text-xs text-zinc-300">
                        {c.rationale}{" "}
                        {expectedGoals?.lambdaHome !== null && expectedGoals?.lambdaAway !== null
                          ? `Este porcentaje sale de un modelo Poisson con goles esperados (λ) ${home}=${expectedGoals.lambdaHome} y ${away}=${expectedGoals.lambdaAway}, calculado con los últimos partidos finalizados (local en casa y visitante fuera).`
                          : "Este porcentaje sale de un modelo Poisson basado en los últimos partidos finalizados (local en casa y visitante fuera)."}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-zinc-300">
                    No hay picks de cuota alta para este partido.
                  </div>
                )}
              </div>
            </div>
          </div>
        </Section>
      ) : null}

      {explanations?.length ? (
        <Section title="Por qué salen esos porcentajes">
          {expectedGoals?.inputs ? (
            <div className="mb-3 rounded-2xl bg-slate-950/40 p-4 text-sm text-zinc-200 ring-1 ring-slate-800">
              <div className="font-semibold">Resumen del cálculo</div>
              <div className="mt-2 text-sm text-zinc-300">
                Muestras usadas: {home} en casa {expectedGoals.inputs.homeHomePlayed} partido(s) y {away} de visitante {expectedGoals.inputs.awayAwayPlayed} partido(s), con ajuste para poca muestra. Goles esperados (λ): {home}={expectedGoals.lambdaHome}, {away}={expectedGoals.lambdaAway}.
              </div>
            </div>
          ) : null}
          <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-200">
            {explanations.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Disparos a puerta (jugadores)">
        <div className="text-sm text-zinc-300">
          No disponible para esta competición/temporada en la API.
        </div>
      </Section>

      <Section
        title="Estadísticas del partido (API)"
        right={
          eventDetails.loading
            ? "Cargando…"
            : eventDetails.source === "cache"
              ? "Cache (3 días)"
              : "API"
        }
      >
        {eventDetails.error ? (
          <div className="text-sm text-red-700 dark:text-red-200">
            Error consultando estadísticas:{" "}
            {String(eventDetails.error?.message ?? eventDetails.error)}
          </div>
        ) : eventDetails.loading ? (
          <div className="text-sm text-zinc-300">
            Cargando estadísticas…
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                partido
              </div>
              <JsonBox value={eventDetails.data?.event ?? null} />
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                respuesta cruda
              </div>
              <JsonBox value={eventDetails.data?.raw ?? null} />
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                estadísticas
              </div>
              <JsonBox value={eventDetails.data?.statistics ?? null} />
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                alineaciones
              </div>
              <JsonBox value={eventDetails.data?.lineups ?? null} />
            </div>
          </div>
        )}
      </Section>
    </AppShell>
  );
}
