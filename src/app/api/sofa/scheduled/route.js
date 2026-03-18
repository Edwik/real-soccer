import { NextResponse } from "next/server";
import { footballDataFetchJson } from "@/lib/footballdata.server";
import { sportsdbFetchJson } from "@/lib/sportsdb.server";

export const runtime = "nodejs";

const ESPN_LEAGUES = [
  { code: "eng.1", category: "Inglaterra" },
  { code: "esp.1", category: "España" },
  { code: "ita.1", category: "Italia" },
  { code: "ger.1", category: "Alemania" },
  { code: "fra.1", category: "Francia" },
  { code: "por.1", category: "Portugal" },
  { code: "ned.1", category: "Países Bajos" },
  { code: "bel.1", category: "Bélgica" },
  { code: "sco.1", category: "Escocia" },
  { code: "tur.1", category: "Turquía" },
  { code: "gre.1", category: "Grecia" },
  { code: "aut.1", category: "Austria" },
  { code: "sui.1", category: "Suiza" },
  { code: "den.1", category: "Dinamarca" },
  { code: "nor.1", category: "Noruega" },
  { code: "swe.1", category: "Suecia" },
  { code: "bra.1", category: "Brasil" },
  { code: "arg.1", category: "Argentina" },
  { code: "mex.1", category: "México" },
  { code: "usa.1", category: "Estados Unidos" },
  { code: "col.1", category: "Colombia" },
  { code: "chi.1", category: "Chile" },
  { code: "uru.1", category: "Uruguay" },
  { code: "jpn.1", category: "Japón" },
  { code: "kor.1", category: "Corea del Sur" },
  { code: "aus.1", category: "Australia" },
  { code: "uefa.champions", category: "UEFA" },
  { code: "uefa.europa", category: "UEFA" },
  { code: "uefa.europa.conf", category: "UEFA" },
];

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function buildStartTimestampSeconds({ dateEvent, strTime }) {
  const date = typeof dateEvent === "string" ? dateEvent : null;
  if (!date || !isIsoDate(date)) return null;

  const time = typeof strTime === "string" && strTime.trim() ? strTime.trim() : "00:00:00";
  const iso = `${date}T${time}Z`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function buildStartTimestampSecondsFromUtcDate(utcDate) {
  const ms = Date.parse(String(utcDate ?? ""));
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function buildEspnEventId(leagueCode, eventId) {
  return `espn__${leagueCode}__${eventId}`;
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

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  if (!isIsoDate(date)) {
    return NextResponse.json(
      { error: "Parámetro date inválido. Usa YYYY-MM-DD." },
      { status: 400 },
    );
  }

  if (process.env.FOOTBALL_DATA_TOKEN) {
    try {
      const json = await footballDataFetchJson(`/matches`, {
        searchParams: { dateFrom: date, dateTo: date },
      });

      const matches = Array.isArray(json?.matches) ? json.matches : [];
      const events = matches
        .filter((m) => m?.id && m?.homeTeam?.id && m?.awayTeam?.id)
        .map((m) => ({
          id: String(m.id),
          startTimestamp: buildStartTimestampSecondsFromUtcDate(m.utcDate),
          status: m?.status ?? null,
          homeTeam: { id: String(m.homeTeam.id), name: m.homeTeam.name, logo: m?.homeTeam?.crest ?? null },
          awayTeam: { id: String(m.awayTeam.id), name: m.awayTeam.name, logo: m?.awayTeam?.crest ?? null },
          tournament: {
            id: m?.competition?.id ? String(m.competition.id) : null,
            name: m?.competition?.name ?? null,
            uniqueTournamentId: m?.competition?.code ?? null,
            category: m?.competition?.area?.name ?? null,
          },
          season: {
            id: m?.season?.id ? String(m.season.id) : null,
            name: m?.season?.startDate ?? null,
          },
        }));

      if (events.length > 0) {
        return NextResponse.json({ date, count: events.length, events, source: "football-data" });
      }
    } catch (_err) {
      void _err;
    }
  }

  const dateParam = date.replaceAll("-", "");
  const leagueResults = await Promise.allSettled(
    ESPN_LEAGUES.map(async (league) => {
      const json = await espnFetchJson(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(league.code)}/scoreboard?dates=${encodeURIComponent(dateParam)}`,
      );
      return { league, json };
    }),
  );

  const merged = [];
  leagueResults.forEach((result) => {
    if (result.status !== "fulfilled") return;
    const { league, json } = result.value;
    const leagueMeta = Array.isArray(json?.leagues) ? json.leagues[0] ?? null : null;
    const events = Array.isArray(json?.events) ? json.events : [];
    events.forEach((e) => {
      const competition = Array.isArray(e?.competitions) ? e.competitions[0] ?? null : null;
      const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
      const home = competitors.find((c) => c?.homeAway === "home") ?? null;
      const away = competitors.find((c) => c?.homeAway === "away") ?? null;
      const homeTeamId = home?.team?.id ? String(home.team.id) : null;
      const awayTeamId = away?.team?.id ? String(away.team.id) : null;
      if (!e?.id || !homeTeamId || !awayTeamId) return;

      const startTimestamp = buildStartTimestampSecondsFromUtcDate(competition?.date ?? e?.date);
      const status =
        competition?.status?.type?.description ??
        e?.status?.type?.description ??
        null;

      merged.push({
        id: buildEspnEventId(league.code, String(e.id)),
        startTimestamp,
        status,
        homeTeam: {
          id: homeTeamId,
          name: home?.team?.displayName ?? home?.team?.name ?? "Local",
          logo:
            home?.team?.logo ??
            (Array.isArray(home?.team?.logos) ? home.team.logos[0]?.href ?? null : null),
        },
        awayTeam: {
          id: awayTeamId,
          name: away?.team?.displayName ?? away?.team?.name ?? "Visitante",
          logo:
            away?.team?.logo ??
            (Array.isArray(away?.team?.logos) ? away.team.logos[0]?.href ?? null : null),
        },
        tournament: {
          id: leagueMeta?.id ? String(leagueMeta.id) : league.code,
          name: leagueMeta?.name ?? leagueMeta?.shortName ?? league.code,
          uniqueTournamentId: league.code,
          category: league.category ?? null,
        },
        season: {
          id: leagueMeta?.season?.year ? String(leagueMeta.season.year) : null,
          name: leagueMeta?.season?.displayName ?? null,
        },
      });
    });
  });

  if (merged.length > 0) {
    merged.sort((a, b) => (a.startTimestamp ?? 0) - (b.startTimestamp ?? 0));
    return NextResponse.json({ date, count: merged.length, events: merged, source: "espn" });
  }

  const json = await sportsdbFetchJson(`/eventsday.php`, {
    searchParams: { d: date, s: "Soccer" },
  });

  const events = (json?.events ?? [])
    .filter((e) => e?.idEvent && e?.idHomeTeam && e?.idAwayTeam)
    .map((e) => ({
      id: String(e.idEvent),
      startTimestamp: buildStartTimestampSeconds({
        dateEvent: e.dateEvent,
        strTime: e.strTime,
      }),
      status: e?.strStatus ?? null,
      homeTeam: { id: String(e.idHomeTeam), name: e.strHomeTeam, logo: null },
      awayTeam: { id: String(e.idAwayTeam), name: e.strAwayTeam, logo: null },
      tournament: {
        id: e?.idLeague ? String(e.idLeague) : null,
        name: e?.strLeague ?? null,
        uniqueTournamentId: e?.idLeague ? String(e.idLeague) : null,
        category: e?.strCountry ?? null,
      },
      season: { id: e?.strSeason ?? null, name: e?.strSeason ?? null },
    }));

  return NextResponse.json({ date, count: events.length, events, source: "sportsdb" });
}
