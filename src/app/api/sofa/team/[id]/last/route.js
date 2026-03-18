import { NextResponse } from "next/server";
import { footballDataFetchJson } from "@/lib/footballdata.server";
import { sportsdbFetchJson } from "@/lib/sportsdb.server";

export const runtime = "nodejs";

function clampInt(value, { min, max, fallback }) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export async function GET(request, { params }) {
  const teamId = params?.id ? String(params.id) : null;
  if (!teamId) {
    return NextResponse.json({ error: "teamId inválido" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const limit = clampInt(searchParams.get("limit"), {
    min: 1,
    max: 25,
    fallback: 10,
  });

  if (process.env.FOOTBALL_DATA_TOKEN) {
    const json = await footballDataFetchJson(`/teams/${encodeURIComponent(teamId)}/matches`, {
      searchParams: { status: "FINISHED", limit: Math.min(50, limit * 3) },
    });
    const matches = Array.isArray(json?.matches) ? json.matches : [];
    return NextResponse.json({ teamId, limit, count: matches.length, events: matches, source: "football-data" });
  }

  const json = await sportsdbFetchJson(`/eventslast.php`, {
    searchParams: { id: teamId },
  });
  const events = (Array.isArray(json?.results) ? json.results : []).slice(0, limit);

  return NextResponse.json({ teamId, limit, count: events.length, events, source: "sportsdb" });
}
