import { NextResponse } from "next/server";
import { sofascoreFetchJson } from "@/lib/sofascore.server";

export const runtime = "nodejs";

function normalize(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");
  if (!name || !name.trim()) {
    return NextResponse.json({ error: "Falta name" }, { status: 400 });
  }
  try {
    const q = name.trim();
    const json = await sofascoreFetchJson(`/search/all`, {
      searchParams: { q },
    });
    const playersA = Array.isArray(json?.players?.data) ? json.players.data : [];
    const playersB = Array.isArray(json?.data?.players) ? json.data.players : [];
    const players = playersA.length ? playersA : playersB;
    if (!players.length) {
      return NextResponse.json({ imageUrl: null });
    }
    const normQ = normalize(q);
    let best = players.find((p) => normalize(p?.name) === normQ) ?? players[0] ?? null;
    const id = best?.id ?? best?.player?.id ?? null;
    if (!Number.isFinite(id)) {
      return NextResponse.json({ imageUrl: null });
    }
    const imageUrl = `https://api.sofascore.app/api/v1/player/${id}/image`;
    return NextResponse.json({ imageUrl });
  } catch (_err) {
    return NextResponse.json({ imageUrl: null });
  }
}

