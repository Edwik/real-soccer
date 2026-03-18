import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const env = {
    node: typeof process !== "undefined" ? process.version : "n/a",
    oddsKey: Boolean(process.env.THEODDS_API_KEY || process.env.ODDS_API_KEY),
  };
  return NextResponse.json({ ok: true, env });
}

