import { NextResponse } from "next/server";
import { sofascoreFetchJson } from "@/lib/sofascore.server";

export const runtime = "nodejs";

const ALLOWED_GROUPS = new Set(["summary", "attack", "defense", "passing"]);

function clampInt(value, { min, max, fallback }) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export async function GET(request, { params }) {
  const uid = Number(params?.uid);
  const sid = Number(params?.sid);
  if (!Number.isFinite(uid) || !Number.isFinite(sid)) {
    return NextResponse.json(
      { error: "uniqueTournamentId/seasonId inválidos" },
      { status: 400 },
    );
  }

  const { searchParams } = new URL(request.url);
  const group = searchParams.get("group") ?? "attack";
  const safeGroup = ALLOWED_GROUPS.has(group) ? group : "attack";

  const limit = clampInt(searchParams.get("limit"), {
    min: 10,
    max: 200,
    fallback: 200,
  });
  const offset = clampInt(searchParams.get("offset"), {
    min: 0,
    max: 10_000,
    fallback: 0,
  });

  const json = await sofascoreFetchJson(
    `/unique-tournament/${uid}/season/${sid}/statistics`,
    {
      searchParams: {
        limit,
        offset,
        order: "-shotsOnGoal",
        accumulation: "total",
        group: safeGroup,
      },
    },
  );

  return NextResponse.json(json);
}

