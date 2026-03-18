import { NextResponse } from "next/server";
import { sofascoreFetchJson } from "@/lib/sofascore.server";

export const runtime = "nodejs";

export async function GET(_request, { params }) {
  const uid = Number(params?.uid);
  const sid = Number(params?.sid);
  if (!Number.isFinite(uid) || !Number.isFinite(sid)) {
    return NextResponse.json(
      { error: "uniqueTournamentId/seasonId inválidos" },
      { status: 400 },
    );
  }

  const json = await sofascoreFetchJson(
    `/unique-tournament/${uid}/season/${sid}/standings/total`,
  );

  return NextResponse.json(json);
}

