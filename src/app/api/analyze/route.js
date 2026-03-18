import { NextResponse } from "next/server";
import {
  buildRecommendationBundle,
  buildTeamMatchRecordFromEvent,
  computeExpectedGoals,
  computeMarketsFromExpectedGoals,
  summarizeTeamMatches,
} from "@/lib/prediction";
import { roundPct } from "@/lib/math";
import { footballDataFetchJson } from "@/lib/footballdata.server";
import { sofascoreFetchJson } from "@/lib/sofascore.server";
import { sportsdbFetchJson } from "@/lib/sportsdb.server";

export const runtime = "nodejs";

function parseEspnCompositeId(value) {
  const raw = String(value ?? "");
  if (!raw.startsWith("espn__")) return null;
  const parts = raw.split("__");
  if (parts.length !== 3) return null;
  const leagueCode = parts[1] ? String(parts[1]) : null;
  const eventId = parts[2] ? String(parts[2]) : null;
  if (!leagueCode || !eventId) return null;
  return { leagueCode, eventId };
}

async function espnFetchJson(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "RealSoccer/1.0",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`ESPN HTTP ${res.status} ${res.statusText}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

function clampInt(value, { min, max, fallback }) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function buildStartTimestampSeconds({ dateEvent, strTime }) {
  const date = typeof dateEvent === "string" ? dateEvent : null;
  if (!date) return null;
  const time = typeof strTime === "string" && strTime.trim() ? strTime.trim() : "00:00:00";
  const ms = Date.parse(`${date}T${time}Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function buildStartTimestampSecondsFromUtcDate(utcDate) {
  const ms = Date.parse(String(utcDate ?? ""));
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function buildTeamMatchRecordFromSportsDbEvent({ event, teamId }) {
  const isHome = String(event?.idHomeTeam ?? "") === String(teamId);
  const isAway = String(event?.idAwayTeam ?? "") === String(teamId);
  if (!isHome && !isAway) return null;

  const homeName = event?.strHomeTeam ?? null;
  const awayName = event?.strAwayTeam ?? null;
  // SportsDB events de temporada no suelen traer badges en cada evento.
  const homeLogo = null;
  const awayLogo = null;

  const homeScore = Number.parseInt(String(event?.intHomeScore ?? ""), 10);
  const awayScore = Number.parseInt(String(event?.intAwayScore ?? ""), 10);

  const hasScores = Number.isFinite(homeScore) && Number.isFinite(awayScore);
  const isFinished = Boolean(hasScores);

  const goalsFor = isHome ? homeScore : awayScore;
  const goalsAgainst = isHome ? awayScore : homeScore;

  let result = "N/A";
  if (isFinished && Number.isFinite(goalsFor) && Number.isFinite(goalsAgainst)) {
    if (goalsFor > goalsAgainst) result = "W";
    else if (goalsFor === goalsAgainst) result = "D";
    else result = "L";
  }

  return {
    eventId: String(event?.idEvent ?? ""),
    startTimestamp: buildStartTimestampSeconds({
      dateEvent: event?.dateEvent,
      strTime: event?.strTime,
    }),
    tournament: event?.strLeague ?? null,
    isFinished,
    isHome,
    isAway,
    teamName: isHome ? homeName : awayName,
    opponentName: isHome ? awayName : homeName,
    teamLogo: isHome ? homeLogo : awayLogo,
    opponentLogo: isHome ? awayLogo : homeLogo,
    goalsFor: Number.isFinite(goalsFor) ? goalsFor : null,
    goalsAgainst: Number.isFinite(goalsAgainst) ? goalsAgainst : null,
    result,
  };
}

function buildTeamMatchRecordFromFootballDataMatch({ match, teamId }) {
  const isHome = String(match?.homeTeam?.id ?? "") === String(teamId);
  const isAway = String(match?.awayTeam?.id ?? "") === String(teamId);
  if (!isHome && !isAway) return null;

  const homeName = match?.homeTeam?.name ?? null;
  const awayName = match?.awayTeam?.name ?? null;
  const homeLogo = match?.homeTeam?.crest ?? null;
  const awayLogo = match?.awayTeam?.crest ?? null;

  const isFinished = match?.status === "FINISHED";
  const homeGoals = match?.score?.fullTime?.home ?? match?.score?.regularTime?.home ?? null;
  const awayGoals = match?.score?.fullTime?.away ?? match?.score?.regularTime?.away ?? null;

  const safeHome = Number.isFinite(homeGoals) ? homeGoals : null;
  const safeAway = Number.isFinite(awayGoals) ? awayGoals : null;

  const goalsFor = isHome ? safeHome : safeAway;
  const goalsAgainst = isHome ? safeAway : safeHome;

  let result = "N/A";
  if (isFinished && Number.isFinite(goalsFor) && Number.isFinite(goalsAgainst)) {
    if (goalsFor > goalsAgainst) result = "W";
    else if (goalsFor === goalsAgainst) result = "D";
    else result = "L";
  }

  return {
    eventId: String(match?.id ?? ""),
    startTimestamp: buildStartTimestampSecondsFromUtcDate(match?.utcDate),
    tournament: match?.competition?.name ?? null,
    isFinished,
    isHome,
    isAway,
    teamName: isHome ? homeName : awayName,
    opponentName: isHome ? awayName : homeName,
    teamLogo: isHome ? homeLogo : awayLogo,
    opponentLogo: isHome ? awayLogo : homeLogo,
    goalsFor: Number.isFinite(goalsFor) ? goalsFor : null,
    goalsAgainst: Number.isFinite(goalsAgainst) ? goalsAgainst : null,
    result,
  };
}

function summarizeFootballDataStandingRow(row) {
  if (!row) return null;
  return {
    position: row?.position ?? null,
    points: row?.points ?? null,
    matches: row?.playedGames ?? null,
    wins: row?.won ?? null,
    draws: row?.draw ?? null,
    losses: row?.lost ?? null,
    goalsFor: row?.goalsFor ?? null,
    goalsAgainst: row?.goalsAgainst ?? null,
    goalDiff: row?.goalDifference ?? null,
    promotionText: null,
  };
}

function buildExplanations({
  homeTeamName,
  awayTeamName,
  homeSummary,
  awaySummary,
  expectedGoals,
  markets,
  modelSamples,
}) {
  const reasons = [];

  reasons.push(
    `Base de cálculo: últimos partidos finalizados (hasta 10) con enfoque en localía/visita. Forma: ${homeTeamName} ${homeSummary.w}-${homeSummary.d}-${homeSummary.l} (${homeSummary.ppg} pts/partido) vs ${awayTeamName} ${awaySummary.w}-${awaySummary.d}-${awaySummary.l} (${awaySummary.ppg} pts/partido).`,
  );

  reasons.push(
    `Muestras del modelo: ${homeTeamName} local=${modelSamples.homeHomePlayed} (máx 10), ${awayTeamName} visitante=${modelSamples.awayAwayPlayed} (máx 10). Cuando hay pocas muestras, se estabiliza con shrinkage.`,
  );

  reasons.push(
    `Estimación de goles (Poisson): λ local=${expectedGoals.lambdaHome}, λ visitante=${expectedGoals.lambdaAway}. Se combinan ataque local + defensa visitante y ataque visitante + defensa local (con shrinkage).`,
  );

  const o25 = markets.totals.find((t) => t.line === 2.5);
  if (o25) {
    reasons.push(
      `Totales 2.5: Over ${roundPct(o25.over)}% / Under ${roundPct(o25.under)}% según la distribución de goles totales derivada de la matriz de marcadores 0–6.`,
    );
  }

  reasons.push(
    `BTTS (ambos anotan): Sí ${markets.pretty.bttsPct.yes}% / No ${markets.pretty.bttsPct.no}% a partir de P(local>0) y P(visitante>0).`,
  );

  reasons.push(
    `1X2: Local ${markets.pretty.oneXtwoPct.home}%, Empate ${markets.pretty.oneXtwoPct.draw}%, Visitante ${markets.pretty.oneXtwoPct.away}%.`,
  );

  return reasons;
}

function formatSofaStatus(status) {
  const type = status?.type ? String(status.type) : "";
  if (type === "finished") return "Finalizado";
  if (type === "inprogress") return "En juego";
  if (type === "notstarted") return "Programado";
  if (type === "postponed") return "Pospuesto";
  if (type === "canceled") return "Cancelado";
  if (type === "interrupted") return "Interrumpido";
  if (type === "abandoned") return "Abandonado";

  const description = status?.description ? String(status.description).trim() : "";
  if (description) return description;

  return type || null;
}

function buildTeamMatchRecordFromEspnScheduleEvent({ event, teamId }) {
  const competition = Array.isArray(event?.competitions) ? event.competitions[0] ?? null : null;
  const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
  const team = competitors.find((c) => String(c?.team?.id ?? "") === String(teamId)) ?? null;
  if (!team) return null;
  const opponent = competitors.find((c) => String(c?.team?.id ?? "") !== String(teamId)) ?? null;

  const isHome = team?.homeAway === "home";
  const isAway = team?.homeAway === "away";
  if (!isHome && !isAway) return null;

  const homeName = competitors.find((c) => c?.homeAway === "home")?.team?.displayName ?? null;
  const awayName = competitors.find((c) => c?.homeAway === "away")?.team?.displayName ?? null;
  const homeLogo =
    competitors.find((c) => c?.homeAway === "home")?.team?.logo ??
    (Array.isArray(competitors.find((c) => c?.homeAway === "home")?.team?.logos)
      ? competitors.find((c) => c?.homeAway === "home").team.logos[0]?.href ?? null
      : null);
  const awayLogo =
    competitors.find((c) => c?.homeAway === "away")?.team?.logo ??
    (Array.isArray(competitors.find((c) => c?.homeAway === "away")?.team?.logos)
      ? competitors.find((c) => c?.homeAway === "away").team.logos[0]?.href ?? null
      : null);

  const goalsFor = Number.parseInt(String(team?.score ?? ""), 10);
  const goalsAgainst = Number.parseInt(String(opponent?.score ?? ""), 10);
  const hasScores = Number.isFinite(goalsFor) && Number.isFinite(goalsAgainst);

  const type = competition?.status?.type ?? {};
  const state = String(type?.state ?? "").toLowerCase();
  const name = String(type?.name ?? "").toUpperCase();
  const completed = Boolean(type?.completed);
  // Consider finished if ESPN reports completed, or state is 'post', or name indicates final.
  const isFinished = completed || state === "post" || name === "STATUS_FINAL";

  let result = "N/A";
  if (isFinished && hasScores) {
    if (goalsFor > goalsAgainst) result = "W";
    else if (goalsFor === goalsAgainst) result = "D";
    else result = "L";
  }

  return {
    eventId: String(event?.id ?? ""),
    startTimestamp: buildStartTimestampSecondsFromUtcDate(competition?.date ?? event?.date),
    tournament: event?.league?.name ?? null,
    isFinished,
    isHome,
    isAway,
    teamName: isHome ? homeName : awayName,
    opponentName: isHome ? awayName : homeName,
    teamLogo: isHome ? homeLogo : awayLogo,
    opponentLogo: isHome ? awayLogo : homeLogo,
    goalsFor: Number.isFinite(goalsFor) ? goalsFor : null,
    goalsAgainst: Number.isFinite(goalsAgainst) ? goalsAgainst : null,
    result,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId");

  if (!eventId) {
    return NextResponse.json({ error: "Falta eventId" }, { status: 400 });
  }

  const espn = parseEspnCompositeId(eventId);
  if (espn) {
    const { leagueCode, eventId: espnEventId } = espn;

    const summary = await espnFetchJson(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(leagueCode)}/summary?event=${encodeURIComponent(espnEventId)}`,
    );

    const competition = Array.isArray(summary?.header?.competitions)
      ? summary.header.competitions[0] ?? null
      : null;
    const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
    const home = competitors.find((c) => c?.homeAway === "home") ?? null;
    const away = competitors.find((c) => c?.homeAway === "away") ?? null;

    const homeTeamId = home?.team?.id ? String(home.team.id) : null;
    const awayTeamId = away?.team?.id ? String(away.team.id) : null;
    if (!homeTeamId || !awayTeamId) {
      return NextResponse.json(
        { error: "No se pudo obtener el partido desde la API." },
        { status: 502 },
      );
    }

    const startTimestamp = buildStartTimestampSecondsFromUtcDate(competition?.date);
    const homeTeamName = home?.team?.displayName ?? home?.team?.name ?? "Local";
    const awayTeamName = away?.team?.displayName ?? away?.team?.name ?? "Visitante";

    const [homeSchedule, awaySchedule] = await Promise.all([
      espnFetchJson(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(leagueCode)}/teams/${encodeURIComponent(homeTeamId)}/schedule`,
      ).catch(() => null),
      espnFetchJson(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(leagueCode)}/teams/${encodeURIComponent(awayTeamId)}/schedule`,
      ).catch(() => null),
    ]);

    function buildTeamMatches(scheduleJson, teamId) {
      const all = Array.isArray(scheduleJson?.events) ? scheduleJson.events : [];
      const mapped = all
        .map((e) => buildTeamMatchRecordFromEspnScheduleEvent({ event: e, teamId }))
        .filter(Boolean)
        .filter((m) => m.isFinished)
        .filter((m) => (startTimestamp ? (m.startTimestamp ?? 0) < startTimestamp : true))
        .sort((a, b) => (b.startTimestamp ?? 0) - (a.startTimestamp ?? 0));
      return mapped;
    }

    let homeAll = buildTeamMatches(homeSchedule, homeTeamId);
    let awayAll = buildTeamMatches(awaySchedule, awayTeamId);

    // Fallback: si ESPN schedule no devuelve partidos, intenta con TheSportsDB por nombre de equipo.
    async function sportsDbLastByTeamName(teamName) {
      if (!teamName) return [];
      const searchJson = await sportsdbFetchJson(`/searchteams.php`, {
        searchParams: { t: teamName },
      }).catch(() => null);
      const team = Array.isArray(searchJson?.teams) ? searchJson.teams[0] ?? null : null;
      const teamId = team?.idTeam ? String(team.idTeam) : null;
      if (!teamId) return [];
      const lastJson = await sportsdbFetchJson(`/eventslast.php`, {
        searchParams: { id: teamId },
      }).catch(() => null);
      const events = Array.isArray(lastJson?.results) ? lastJson.results : [];
      return events
        .map((e) => buildTeamMatchRecordFromSportsDbEvent({ event: e, teamId }))
        .filter(Boolean);
    }

    if (homeAll.length === 0) {
      const alt = await sportsDbLastByTeamName(homeTeamName).catch(() => []);
      homeAll = Array.isArray(alt) ? alt : [];
    }
    if (awayAll.length === 0) {
      const alt = await sportsDbLastByTeamName(awayTeamName).catch(() => []);
      awayAll = Array.isArray(alt) ? alt : [];
    }

    async function sofaTeamIdByName(name) {
      if (!name) return null;
      const searchJson = await sofascoreFetchJson(`/search/all`, {
        searchParams: { q: name },
      }).catch(() => null);
      const teamsA = Array.isArray(searchJson?.teams?.data) ? searchJson.teams.data : [];
      const teamsB = Array.isArray(searchJson?.data?.teams) ? searchJson.data.teams : [];
      const t = teamsA[0] ?? teamsB[0] ?? null;
      const id = t?.id ?? t?.team?.id ?? null;
      return Number.isFinite(id) ? id : null;
    }

    async function sofaLastEventsByTeamName(name, targetTeamId) {
      const id = await sofaTeamIdByName(name);
      if (!id) return [];
      const [p0, p1] = await Promise.all([
        sofascoreFetchJson(`/team/${encodeURIComponent(String(id))}/events/last/0`).catch(() => null),
        sofascoreFetchJson(`/team/${encodeURIComponent(String(id))}/events/last/1`).catch(() => null),
      ]);
      const all = [
        ...(Array.isArray(p0?.events) ? p0.events : []),
        ...(Array.isArray(p1?.events) ? p1.events : []),
      ];
      const byId = new Map();
      all.forEach((e) => {
        if (!e?.id) return;
        byId.set(String(e.id), e);
      });
      return Array.from(byId.values())
        .map((e) => buildTeamMatchRecordFromEvent({ event: e, teamId: String(targetTeamId) }))
        .filter(Boolean);
    }

    // Enriquecimiento: para partidos sin marcador en ESPN, intenta obtenerlo desde summaries
    async function enrichEspnScores(league, records, teamId) {
      const missing = records.filter(
        (m) => !(Number.isFinite(m?.goalsFor) && Number.isFinite(m?.goalsAgainst)),
      );
      if (!missing.length) return records;
      const limit = Math.min(25, missing.length);
      const tasks = missing.slice(0, limit).map(async (m) => {
        try {
          const s = await espnFetchJson(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(
              league,
            )}/summary?event=${encodeURIComponent(m.eventId)}`,
          );
          const comp = Array.isArray(s?.header?.competitions)
            ? s.header.competitions[0] ?? null
            : null;
          const comps = Array.isArray(comp?.competitors) ? comp.competitors : [];
          const me =
            comps.find((c) => String(c?.team?.id ?? "") === String(teamId)) ?? null;
          const opp =
            comps.find((c) => String(c?.team?.id ?? "") !== String(teamId)) ?? null;
          const gf = Number.parseInt(String(me?.score ?? ""), 10);
          const ga = Number.parseInt(String(opp?.score ?? ""), 10);
          const hasScores = Number.isFinite(gf) && Number.isFinite(ga);
          const type = comp?.status?.type ?? {};
          const state = String(type?.state ?? "").toLowerCase();
          const name = String(type?.name ?? "").toUpperCase();
          const completed = Boolean(type?.completed);
          const finished = completed || state === "post" || name === "STATUS_FINAL";
          let result = "N/A";
          if (finished && hasScores) {
            if (gf > ga) result = "W";
            else if (gf === ga) result = "D";
            else result = "L";
          }
          const home = comps.find((c) => c?.homeAway === "home") ?? null;
          const away = comps.find((c) => c?.homeAway === "away") ?? null;
          const homeLogo =
            home?.team?.logo ??
            (Array.isArray(home?.team?.logos) ? home.team.logos[0]?.href ?? null : null);
          const awayLogo =
            away?.team?.logo ??
            (Array.isArray(away?.team?.logos) ? away.team.logos[0]?.href ?? null : null);
          return {
            ...m,
            goalsFor: hasScores ? gf : m.goalsFor,
            goalsAgainst: hasScores ? ga : m.goalsAgainst,
            result: hasScores ? result : m.result,
            teamLogo: m.teamLogo ?? (m.isHome ? homeLogo : awayLogo),
            opponentLogo: m.opponentLogo ?? (m.isHome ? awayLogo : homeLogo),
          };
        } catch {
          return m;
        }
      });
      const enriched = await Promise.all(tasks);
      // Merge enriched back
      const byKey = new Map(records.map((r) => [`${r.eventId}-${r.startTimestamp ?? ""}`, r]));
      for (const e of enriched) {
        const k = `${e.eventId}-${e.startTimestamp ?? ""}`;
        byKey.set(k, e);
      }
      return Array.from(byKey.values());
    }

    homeAll = await enrichEspnScores(leagueCode, homeAll, homeTeamId);
    awayAll = await enrichEspnScores(leagueCode, awayAll, awayTeamId);

    const altHomeSofa = await sofaLastEventsByTeamName(homeTeamName, homeTeamId).catch(
      () => [],
    );
    const altAwaySofa = await sofaLastEventsByTeamName(awayTeamName, awayTeamId).catch(
      () => [],
    );
    function mergePreferSofa(primary, sofaAlt) {
      const merged = new Map();
      [...primary, ...sofaAlt].forEach((m) => {
        if (!m) return;
        const key = `${m.eventId}-${m.startTimestamp ?? ""}`;
        const existing = merged.get(key);
        if (!existing) {
          merged.set(key, m);
        } else {
          // prefer item that has valid scores and logos
          const existingScore = Number.isFinite(existing?.goalsFor) && Number.isFinite(existing?.goalsAgainst);
          const candidateScore = Number.isFinite(m?.goalsFor) && Number.isFinite(m?.goalsAgainst);
          const existingLogos = Boolean(existing?.teamLogo) && Boolean(existing?.opponentLogo);
          const candidateLogos = Boolean(m?.teamLogo) && Boolean(m?.opponentLogo);
          if ((!existingScore && candidateScore) || (!existingLogos && candidateLogos)) {
            merged.set(key, m);
          }
        }
      });
      return Array.from(merged.values()).sort((a, b) => (b.startTimestamp ?? 0) - (a.startTimestamp ?? 0));
    }
    // Si faltan partidos o faltan logos/marcador en varios, preferimos SofaScore
    function needsSofa(list) {
      const first = list.slice(0, 8);
      const missingLogos = first.filter((m) => !m?.teamLogo || !m?.opponentLogo).length;
      const missingScore = first.filter((m) => !(Number.isFinite(m?.goalsFor) && Number.isFinite(m?.goalsAgainst))).length;
      return list.length < 15 || missingLogos > 2 || missingScore > 2;
    }
    if (Array.isArray(altHomeSofa) && altHomeSofa.length > 0 && needsSofa(homeAll)) {
      homeAll = mergePreferSofa(homeAll, altHomeSofa);
    }
    if (Array.isArray(altAwaySofa) && altAwaySofa.length > 0 && needsSofa(awayAll)) {
      awayAll = mergePreferSofa(awayAll, altAwaySofa);
    }

    const homeLast = homeAll
      .filter((m) => (startTimestamp ? (m.startTimestamp ?? 0) < startTimestamp : true))
      .slice(0, 15);
    const awayLast = awayAll
      .filter((m) => (startTimestamp ? (m.startTimestamp ?? 0) < startTimestamp : true))
      .slice(0, 15);

    const homeHomeLast = homeAll
      .filter((m) => m.isHome && (startTimestamp ? (m.startTimestamp ?? 0) < startTimestamp : true))
      .slice(0, 15);
    const awayAwayLast = awayAll
      .filter((m) => m.isAway && (startTimestamp ? (m.startTimestamp ?? 0) < startTimestamp : true))
      .slice(0, 15);

    const homeSummary = summarizeTeamMatches(homeLast);
    const awaySummary = summarizeTeamMatches(awayLast);

    const expectedGoalsBase = computeExpectedGoals({
      homeTeamMatches: homeHomeLast,
      awayTeamMatches: awayAwayLast,
    });

    function parseEspnAvailability(summaryJson, homeId, awayId) {
      const result = {
        home: { missingStarters: 0, impact: 0 },
        away: { missingStarters: 0, impact: 0 },
      };
      const rosters = summaryJson?.rosters ?? null;
      if (!rosters) return result;

      function analyzeTeam(obj, teamId) {
        // Try multiple possible shapes defensively
        const rosterEntries =
          Array.isArray(obj?.roster)
            ? obj.roster
            : Array.isArray(obj?.entries)
              ? obj.entries
              : Array.isArray(obj)
                ? obj
                : [];

        const starters = rosterEntries.filter((p) => Boolean(p?.starter));
        const missing = starters.filter((p) => {
          const status = (p?.status?.type ?? p?.status ?? p?.injuryStatus ?? "").toString().toUpperCase();
          const notActive = Boolean(p?.notActive);
          return (
            notActive ||
            status.includes("INJ") ||
            status.includes("SUSP") ||
            status.includes("DISCIPLINE") ||
            status.includes("RED")
          );
        });
        const missingStarters = missing.length;
        // Simple impact: 3% por titular ausente, tope 15%
        const impact = Math.min(0.15, missingStarters * 0.03);
        return { missingStarters, impact };
      }

      // Attempt to locate per-team objects
      let homeObj = null;
      let awayObj = null;

      // rosters may be an array with team.id
      if (Array.isArray(rosters)) {
        homeObj = rosters.find((r) => String(r?.team?.id ?? r?.teamId ?? "") === String(homeId)) ?? null;
        awayObj = rosters.find((r) => String(r?.team?.id ?? r?.teamId ?? "") === String(awayId)) ?? null;
      }
      // or shape { home: {...}, away: {...} }
      if (!homeObj && rosters?.home) homeObj = rosters.home;
      if (!awayObj && rosters?.away) awayObj = rosters.away;

      if (homeObj) result.home = analyzeTeam(homeObj, homeId);
      if (awayObj) result.away = analyzeTeam(awayObj, awayId);
      return result;
    }

    const availability = parseEspnAvailability(summary, homeTeamId, awayTeamId);
    const lambdaHomeAdj = Number(
      (expectedGoalsBase.lambdaHome * (1 - availability.home.impact)).toFixed(3),
    );
    const lambdaAwayAdj = Number(
      (expectedGoalsBase.lambdaAway * (1 - availability.away.impact)).toFixed(3),
    );

    const expectedGoals = {
      ...expectedGoalsBase,
      lambdaHome: lambdaHomeAdj,
      lambdaAway: lambdaAwayAdj,
      inputs: {
        ...expectedGoalsBase.inputs,
        availability: {
          home: availability.home,
          away: availability.away,
        },
      },
    };

    const markets = computeMarketsFromExpectedGoals({
      lambdaHome: expectedGoals.lambdaHome,
      lambdaAway: expectedGoals.lambdaAway,
    });

    const recommendations = buildRecommendationBundle(markets);

    const league = summary?.header?.league ?? null;
    const status =
      competition?.status?.type?.description ??
      competition?.status?.type?.shortDetail ??
      null;

    const explanations = buildExplanations({
      homeTeamName,
      awayTeamName,
      homeSummary,
      awaySummary,
      expectedGoals,
      markets,
      modelSamples: expectedGoals.inputs,
    });

    const payload = {
      event: {
        id: String(eventId),
        startTimestamp,
        status,
        homeTeam: { id: homeTeamId, name: homeTeamName },
        awayTeam: { id: awayTeamId, name: awayTeamName },
        tournament: {
          name: league?.name ?? leagueCode,
          category: league?.abbreviation ?? null,
          uniqueTournamentId: leagueCode,
        },
        season: {
          id: summary?.header?.season?.year ? String(summary.header.season.year) : null,
          name: summary?.header?.season?.displayName ?? null,
        },
        stage: {
          round: competition?.type?.abbreviation ?? null,
          name: competition?.type?.text ?? null,
          leg: null,
        },
      },
      samples: {
        homeLast,
        awayLast,
        homeSummary,
        awaySummary,
        model: {
          homeHomeLast,
          awayAwayLast,
        },
        lastCount: 15,
      },
      standings: {
        available: false,
        home: null,
        away: null,
      },
      model: {
        expectedGoals,
        markets,
        recommendations,
        explanations,
      },
      players: {
        shotsOnGoal: { available: false, home: null, away: null },
      },
      raw: { summary, teamHome: homeSchedule, teamAway: awaySchedule },
      source: "espn",
    };

    return NextResponse.json(payload);
  }

  if (process.env.FOOTBALL_DATA_TOKEN) {
    const matchJson = await footballDataFetchJson(`/matches/${encodeURIComponent(eventId)}`);
    const match = matchJson?.match ?? null;

    const homeTeamId = match?.homeTeam?.id ? String(match.homeTeam.id) : null;
    const awayTeamId = match?.awayTeam?.id ? String(match.awayTeam.id) : null;

    if (!homeTeamId || !awayTeamId) {
      return NextResponse.json(
        { error: "No se pudo obtener el partido desde la API." },
        { status: 502 },
      );
    }

    const homeTeamName = match?.homeTeam?.name ?? "Local";
    const awayTeamName = match?.awayTeam?.name ?? "Visitante";

    const [homeMatchesJson, awayMatchesJson] = await Promise.all([
      footballDataFetchJson(`/teams/${encodeURIComponent(homeTeamId)}/matches`, {
        searchParams: { status: "FINISHED", limit: 50 },
      }).catch(() => null),
      footballDataFetchJson(`/teams/${encodeURIComponent(awayTeamId)}/matches`, {
        searchParams: { status: "FINISHED", limit: 50 },
      }).catch(() => null),
    ]);

    const homeAll = (Array.isArray(homeMatchesJson?.matches) ? homeMatchesJson.matches : [])
      .map((m) => buildTeamMatchRecordFromFootballDataMatch({ match: m, teamId: homeTeamId }))
      .filter(Boolean)
      .sort((a, b) => (b.startTimestamp ?? 0) - (a.startTimestamp ?? 0));

    const awayAll = (Array.isArray(awayMatchesJson?.matches) ? awayMatchesJson.matches : [])
      .map((m) => buildTeamMatchRecordFromFootballDataMatch({ match: m, teamId: awayTeamId }))
      .filter(Boolean)
      .sort((a, b) => (b.startTimestamp ?? 0) - (a.startTimestamp ?? 0));

    const homeLast = homeAll.slice(0, 15);
    const awayLast = awayAll.slice(0, 15);

    const homeHomeLast = homeAll.filter((m) => m.isHome).slice(0, 15);
    const awayAwayLast = awayAll.filter((m) => m.isAway).slice(0, 15);

    const homeSummary = summarizeTeamMatches(homeLast);
    const awaySummary = summarizeTeamMatches(awayLast);

    const expectedGoals = computeExpectedGoals({
      homeTeamMatches: homeHomeLast,
      awayTeamMatches: awayAwayLast,
    });

    const markets = computeMarketsFromExpectedGoals({
      lambdaHome: expectedGoals.lambdaHome,
      lambdaAway: expectedGoals.lambdaAway,
    });

    const recommendations = buildRecommendationBundle(markets);

    const competitionCode = match?.competition?.code ?? null;
    const standingsJson = competitionCode
      ? await footballDataFetchJson(`/competitions/${encodeURIComponent(competitionCode)}/standings`).catch(() => null)
      : null;

    const table = Array.isArray(standingsJson?.standings)
      ? standingsJson.standings.find((s) => s?.type === "TOTAL")?.table ?? null
      : null;

    const homeStanding = Array.isArray(table)
      ? summarizeFootballDataStandingRow(table.find((r) => String(r?.team?.id ?? "") === String(homeTeamId)) ?? null)
      : null;

    const awayStanding = Array.isArray(table)
      ? summarizeFootballDataStandingRow(table.find((r) => String(r?.team?.id ?? "") === String(awayTeamId)) ?? null)
      : null;

    const explanations = buildExplanations({
      homeTeamName,
      awayTeamName,
      homeSummary,
      awaySummary,
      expectedGoals,
      markets,
      modelSamples: expectedGoals.inputs,
    });

    const payload = {
      event: {
        id: String(match?.id ?? eventId),
        startTimestamp: buildStartTimestampSecondsFromUtcDate(match?.utcDate),
        status: match?.status ?? null,
        homeTeam: { id: homeTeamId, name: homeTeamName },
        awayTeam: { id: awayTeamId, name: awayTeamName },
        tournament: {
          name: match?.competition?.name ?? null,
          category: match?.competition?.area?.name ?? null,
          uniqueTournamentId: competitionCode,
        },
        season: {
          id: match?.season?.id ? String(match.season.id) : null,
          name: match?.season?.startDate ?? null,
        },
        stage: {
          round: match?.matchday ?? null,
          name: match?.stage ?? null,
          leg: null,
        },
      },
      samples: {
        homeLast,
        awayLast,
        homeSummary,
        awaySummary,
        model: {
          homeHomeLast,
          awayAwayLast,
        },
        lastCount: 15,
      },
      standings: {
        available: Boolean(table),
        home: homeStanding,
        away: awayStanding,
      },
      model: {
        expectedGoals,
        markets,
        recommendations,
        explanations,
      },
      players: {
        shotsOnGoal: { available: false, home: null, away: null },
      },
      raw: { match: matchJson, teamHome: homeMatchesJson, teamAway: awayMatchesJson, standings: standingsJson },
      source: "football-data",
    };

    return NextResponse.json(payload);
  }

  try {
    const eventJson = await sofascoreFetchJson(`/event/${encodeURIComponent(eventId)}`);
    const event = eventJson?.event ?? null;

    const homeTeamId = event?.homeTeam?.id ?? null;
    const awayTeamId = event?.awayTeam?.id ?? null;

    const homeTeamIdStr = homeTeamId !== null ? String(homeTeamId) : null;
    const awayTeamIdStr = awayTeamId !== null ? String(awayTeamId) : null;

    if (!homeTeamIdStr || !awayTeamIdStr) {
      throw new Error("No se pudo obtener el partido desde SofaScore.");
    }

    const homeTeamName = event?.homeTeam?.name ?? "Local";
    const awayTeamName = event?.awayTeam?.name ?? "Visitante";

    async function fetchTeamLastEvents(teamId) {
      const [p0, p1] = await Promise.all([
        sofascoreFetchJson(`/team/${encodeURIComponent(String(teamId))}/events/last/0`).catch(() => null),
        sofascoreFetchJson(`/team/${encodeURIComponent(String(teamId))}/events/last/1`).catch(() => null),
      ]);

      const all = [
        ...(Array.isArray(p0?.events) ? p0.events : []),
        ...(Array.isArray(p1?.events) ? p1.events : []),
      ];

      const byId = new Map();
      all.forEach((e) => {
        if (!e?.id) return;
        byId.set(String(e.id), e);
      });

      return Array.from(byId.values());
    }

    const [homeEvents, awayEvents] = await Promise.all([
      fetchTeamLastEvents(homeTeamId),
      fetchTeamLastEvents(awayTeamId),
    ]);

    const homeAll = homeEvents
      .map((e) => buildTeamMatchRecordFromEvent({ event: e, teamId: homeTeamId }))
      .filter(Boolean)
      .filter((m) => m.isFinished)
      .sort((a, b) => (b.startTimestamp ?? 0) - (a.startTimestamp ?? 0));

    const awayAll = awayEvents
      .map((e) => buildTeamMatchRecordFromEvent({ event: e, teamId: awayTeamId }))
      .filter(Boolean)
      .filter((m) => m.isFinished)
      .sort((a, b) => (b.startTimestamp ?? 0) - (a.startTimestamp ?? 0));

    const homeLast = homeAll.slice(0, 15);
    const awayLast = awayAll.slice(0, 15);

    const homeHomeLast = homeAll.filter((m) => m.isHome).slice(0, 15);
    const awayAwayLast = awayAll.filter((m) => m.isAway).slice(0, 15);

    const homeSummary = summarizeTeamMatches(homeLast);
    const awaySummary = summarizeTeamMatches(awayLast);

    const expectedGoals = computeExpectedGoals({
      homeTeamMatches: homeHomeLast,
      awayTeamMatches: awayAwayLast,
    });

    const markets = computeMarketsFromExpectedGoals({
      lambdaHome: expectedGoals.lambdaHome,
      lambdaAway: expectedGoals.lambdaAway,
    });

    const recommendations = buildRecommendationBundle(markets);

    const uniqueTournamentId = event?.tournament?.uniqueTournament?.id ?? null;
    const seasonId = event?.season?.id ?? null;
    const standingsJson =
      uniqueTournamentId && seasonId
        ? await sofascoreFetchJson(
            `/unique-tournament/${encodeURIComponent(String(uniqueTournamentId))}/season/${encodeURIComponent(String(seasonId))}/standings/total`,
          ).catch(() => null)
        : null;

    const standings = Array.isArray(standingsJson?.standings) ? standingsJson.standings : [];
    const firstStanding = standings[0] ?? null;
    const tableRows = Array.isArray(firstStanding?.rows) ? firstStanding.rows : null;

    function summarizeStandingRow(row) {
      if (!row) return null;
      const scoresFor = Number.isFinite(row?.scoresFor) ? row.scoresFor : null;
      const scoresAgainst = Number.isFinite(row?.scoresAgainst) ? row.scoresAgainst : null;
      return {
        position: row?.position ?? null,
        points: row?.points ?? null,
        matches: row?.matches ?? null,
        wins: row?.wins ?? null,
        draws: row?.draws ?? null,
        losses: row?.losses ?? null,
        goalsFor: scoresFor,
        goalsAgainst: scoresAgainst,
        goalDiff:
          scoresFor !== null && scoresAgainst !== null ? scoresFor - scoresAgainst : null,
        promotionText: row?.promotion?.text ?? null,
      };
    }

    const homeStanding = Array.isArray(tableRows)
      ? summarizeStandingRow(
          tableRows.find((r) => String(r?.team?.id ?? "") === homeTeamIdStr) ?? null,
        )
      : null;

    const awayStanding = Array.isArray(tableRows)
      ? summarizeStandingRow(
          tableRows.find((r) => String(r?.team?.id ?? "") === awayTeamIdStr) ?? null,
        )
      : null;

    const explanations = buildExplanations({
      homeTeamName,
      awayTeamName,
      homeSummary,
      awaySummary,
      expectedGoals,
      markets,
      modelSamples: expectedGoals.inputs,
    });

    const payload = {
      event: {
        id: String(event?.id ?? eventId),
        startTimestamp: Number.isFinite(event?.startTimestamp) ? event.startTimestamp : null,
        status: formatSofaStatus(event?.status),
        homeTeam: { id: homeTeamIdStr, name: homeTeamName },
        awayTeam: { id: awayTeamIdStr, name: awayTeamName },
        tournament: {
          name: event?.tournament?.name ?? null,
          category: event?.tournament?.category?.name ?? null,
          uniqueTournamentId: uniqueTournamentId !== null ? String(uniqueTournamentId) : null,
        },
        season: {
          id: seasonId !== null ? String(seasonId) : null,
          name: event?.season?.name ?? null,
        },
        stage: {
          round: event?.roundInfo?.round ?? null,
          name: event?.roundInfo?.name ?? null,
          leg: null,
        },
      },
      samples: {
        homeLast,
        awayLast,
        homeSummary,
        awaySummary,
        model: {
          homeHomeLast,
          awayAwayLast,
        },
        lastCount: 15,
      },
      standings: {
        available: Boolean(tableRows),
        home: homeStanding,
        away: awayStanding,
      },
      model: {
        expectedGoals,
        markets,
        recommendations,
        explanations,
      },
      players: {
        shotsOnGoal: { available: false, home: null, away: null },
      },
      raw: { event: eventJson, teamHome: homeEvents, teamAway: awayEvents, standings: standingsJson },
      source: "sofascore",
    };

    return NextResponse.json(payload);
  } catch (err) {
    void err;
  }

  const eventJson = await sportsdbFetchJson(`/lookupevent.php`, {
    searchParams: { id: eventId },
  });
  const event = Array.isArray(eventJson?.events) ? eventJson.events[0] ?? null : null;

  const homeTeamId = event?.idHomeTeam ? String(event.idHomeTeam) : null;
  const awayTeamId = event?.idAwayTeam ? String(event.idAwayTeam) : null;

  if (!homeTeamId || !awayTeamId) {
    return NextResponse.json(
      { error: "No se pudo obtener el partido desde la API." },
      { status: 502 },
    );
  }

  const homeTeamName = event?.strHomeTeam ?? "Local";
  const awayTeamName = event?.strAwayTeam ?? "Visitante";

  const leagueId = event?.idLeague ? String(event.idLeague) : null;
  const seasonName = event?.strSeason ?? null;
  const matchDate = event?.dateEvent ?? null;

  const seasonEventsJson =
    leagueId && seasonName
      ? await sportsdbFetchJson(`/eventsseason.php`, {
          searchParams: { id: leagueId, s: seasonName },
        }).catch(() => null)
      : null;

  const seasonEvents = Array.isArray(seasonEventsJson?.events)
    ? seasonEventsJson.events
    : [];

  function isBeforeMatchDate(e) {
    if (!matchDate) return true;
    const d = e?.dateEvent;
    return typeof d === "string" ? d < matchDate : true;
  }

  function isFinished(e) {
    const h = Number.parseInt(String(e?.intHomeScore ?? ""), 10);
    const a = Number.parseInt(String(e?.intAwayScore ?? ""), 10);
    return Number.isFinite(h) && Number.isFinite(a);
  }

  function teamMatches(teamId) {
    const filtered = seasonEvents
      .filter((e) => isBeforeMatchDate(e))
      .filter((e) => String(e?.idHomeTeam ?? "") === String(teamId) || String(e?.idAwayTeam ?? "") === String(teamId))
      .filter((e) => isFinished(e))
      .map((e) => buildTeamMatchRecordFromSportsDbEvent({ event: e, teamId }))
      .filter(Boolean)
      .sort((a, b) => (b.startTimestamp ?? 0) - (a.startTimestamp ?? 0));

    return filtered;
  }

  const homeAll = teamMatches(homeTeamId);
  const awayAll = teamMatches(awayTeamId);

  const homeLast = homeAll.slice(0, 15);
  const awayLast = awayAll.slice(0, 15);

  const homeHomeLast = homeAll.filter((m) => m.isHome).slice(0, 15);
  const awayAwayLast = awayAll.filter((m) => m.isAway).slice(0, 15);

  const homeSummary = summarizeTeamMatches(homeLast);
  const awaySummary = summarizeTeamMatches(awayLast);

  const expectedGoals = computeExpectedGoals({
    homeTeamMatches: homeHomeLast,
    awayTeamMatches: awayAwayLast,
  });

  const markets = computeMarketsFromExpectedGoals({
    lambdaHome: expectedGoals.lambdaHome,
    lambdaAway: expectedGoals.lambdaAway,
  });

  const recommendations = buildRecommendationBundle(markets);

  const tableJson =
    leagueId && seasonName
      ? await sportsdbFetchJson(`/lookuptable.php`, {
          searchParams: { l: leagueId, s: seasonName },
        }).catch(() => null)
      : null;

  const table = Array.isArray(tableJson?.table) ? tableJson.table : null;

  function findTableRow(teamId) {
    if (!Array.isArray(table)) return null;
    return table.find((r) => String(r?.teamid ?? "") === String(teamId)) ?? null;
  }

  function summarizeTableRow(row) {
    if (!row) return null;
    const position = clampInt(row?.intRank, { min: 1, max: 500, fallback: null });
    const points = clampInt(row?.intPoints, { min: 0, max: 500, fallback: null });
    const matches = clampInt(row?.intPlayed, { min: 0, max: 500, fallback: null });
    const wins = clampInt(row?.intWin, { min: 0, max: 500, fallback: null });
    const draws = clampInt(row?.intDraw, { min: 0, max: 500, fallback: null });
    const losses = clampInt(row?.intLoss, { min: 0, max: 500, fallback: null });

    return {
      position,
      points,
      matches,
      wins,
      draws,
      losses,
      goalsFor: clampInt(row?.intGoalsFor, { min: 0, max: 500, fallback: null }),
      goalsAgainst: clampInt(row?.intGoalsAgainst, { min: 0, max: 500, fallback: null }),
      goalDiff: clampInt(row?.intGoalDifference, { min: -500, max: 500, fallback: null }),
      promotionText: null,
    };
  }

  const homeStanding = summarizeTableRow(findTableRow(homeTeamId));
  const awayStanding = summarizeTableRow(findTableRow(awayTeamId));

  const explanations = buildExplanations({
    homeTeamName,
    awayTeamName,
    homeSummary,
    awaySummary,
    expectedGoals,
    markets,
    modelSamples: expectedGoals.inputs,
  });

  const startTimestamp = buildStartTimestampSeconds({
    dateEvent: event?.dateEvent,
    strTime: event?.strTime,
  });

  const payload = {
    event: {
      id: String(eventId),
      startTimestamp,
      status: event?.strStatus ?? null,
      homeTeam: { id: homeTeamId, name: homeTeamName },
      awayTeam: { id: awayTeamId, name: awayTeamName },
      tournament: {
        name: event?.strLeague ?? null,
        category: event?.strCountry ?? null,
        uniqueTournamentId: leagueId,
      },
      season: { id: seasonName, name: seasonName },
      stage: {
        round: null,
        name: null,
        leg: null,
      },
    },
    samples: {
      homeLast,
      awayLast,
      homeSummary,
      awaySummary,
      model: {
        homeHomeLast,
        awayAwayLast,
      },
      lastCount: 15,
    },
    standings: {
      available: Boolean(table),
      home: homeStanding,
      away: awayStanding,
    },
    model: {
      expectedGoals,
      markets,
      recommendations,
      explanations,
    },
    players: {
      shotsOnGoal: { available: false, home: null, away: null },
    },
    raw: { event: eventJson, seasonEvents: seasonEventsJson, table: tableJson },
    source: "sportsdb",
  };

  return NextResponse.json(payload);
}
