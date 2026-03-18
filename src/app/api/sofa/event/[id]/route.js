import { NextResponse } from "next/server";
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

export async function GET(_request, { params }) {
  const resolvedParams = await params;
  const eventId = resolvedParams?.id;
  if (!eventId) {
    return NextResponse.json({ error: "eventId inválido" }, { status: 400 });
  }

  const espn = parseEspnCompositeId(eventId);
  if (espn) {
    const summary = await espnFetchJson(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(espn.leagueCode)}/summary?event=${encodeURIComponent(espn.eventId)}`,
    );
    return NextResponse.json({
      event: summary?.header?.competitions?.[0] ?? null,
      statistics: summary?.boxscore ?? null,
      lineups: summary?.rosters ?? null,
      raw: summary,
      source: "espn",
    });
  }

  if (process.env.FOOTBALL_DATA_TOKEN) {
    const json = await footballDataFetchJson(`/matches/${encodeURIComponent(eventId)}`);
    const match = json?.match ?? null;
    return NextResponse.json({
      event: match,
      statistics: null,
      lineups: null,
      raw: json,
      source: "football-data",
    });
  }

  try {
    const [eventJson, statisticsJson, lineupsJson] = await Promise.all([
      sofascoreFetchJson(`/event/${encodeURIComponent(eventId)}`),
      sofascoreFetchJson(`/event/${encodeURIComponent(eventId)}/statistics`).catch(() => null),
      sofascoreFetchJson(`/event/${encodeURIComponent(eventId)}/lineups`).catch(() => null),
    ]);

    return NextResponse.json({
      event: eventJson?.event ?? null,
      statistics: statisticsJson,
      lineups: lineupsJson,
      raw: { event: eventJson, statistics: statisticsJson, lineups: lineupsJson },
      source: "sofascore",
    });
  } catch (_err) {
    const json = await sportsdbFetchJson(`/lookupevent.php`, {
      searchParams: { id: eventId },
    });

    const event = Array.isArray(json?.events) ? json.events[0] ?? null : null;

    return NextResponse.json({ event, statistics: null, lineups: null, raw: json, source: "sportsdb" });
  }
}
