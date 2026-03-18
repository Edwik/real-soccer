import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SPORTS_MAP = {
  "uefa.champions": "soccer_uefa_champs_league",
  "esp.1": "soccer_spain_la_liga",
  "eng.1": "soccer_epl",
  "ita.1": "soccer_italy_serie_a",
  "deu.1": "soccer_germany_bundesliga",
  "fra.1": "soccer_france_ligue_one",
  "jpn.1": "soccer_japan_j_league",
  "uefa.europa": "soccer_uefa_europa_league",
};

function norm(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function espnSummary(leagueCode, eventId) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(
    leagueCode,
  )}/summary?event=${encodeURIComponent(eventId)}`;
  const res = await fetch(url, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error("espn summary fetch failed");
  return res.json();
}

export async function GET(_req, ctx) {
  try {
    const params = await ctx.params;
    const id = params?.id ?? "";
    const [provider, leagueCode, eventId] = String(id).split("__");
    if (!provider || !leagueCode || !eventId) {
      return NextResponse.json({ error: "bad id" }, { status: 400 });
    }
    const sportKey = SPORTS_MAP[leagueCode] ?? null;
    if (!sportKey) {
      return NextResponse.json({ available: false, reason: "unsupported league" });
    }
    const apiKey = process.env.THEODDS_API_KEY ?? process.env.ODDS_API_KEY ?? null;
    if (!apiKey) {
      return NextResponse.json({ available: false, reason: "no api key" });
    }

    const summary = await espnSummary(leagueCode, eventId);
    const comp = Array.isArray(summary?.header?.competitions)
      ? summary.header.competitions[0] ?? null
      : null;
    const comps = Array.isArray(comp?.competitors) ? comp.competitors : [];
    const homeName =
      comps.find((c) => c?.homeAway === "home")?.team?.displayName ??
      comps.find((c) => c?.homeAway === "home")?.team?.name ??
      null;
    const awayName =
      comps.find((c) => c?.homeAway === "away")?.team?.displayName ??
      comps.find((c) => c?.homeAway === "away")?.team?.name ??
      null;
    if (!homeName || !awayName) {
      return NextResponse.json({ available: false, reason: "no teams" });
    }

    const oddsUrl = new URL(
      `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(
        sportKey,
      )}/odds`,
    );
    oddsUrl.searchParams.set("regions", "eu,us");
    oddsUrl.searchParams.set("markets", "h2h,totals,btts,spreads");
    oddsUrl.searchParams.set("oddsFormat", "decimal");
    oddsUrl.searchParams.set("apiKey", apiKey);
    const oRes = await fetch(oddsUrl, { next: { revalidate: 30 } });
    if (!oRes.ok) {
      return NextResponse.json({ available: false, reason: "odds fetch failed" });
    }
    const events = await oRes.json();
    const wantHome = norm(homeName);
    const wantAway = norm(awayName);
    const target = Array.isArray(events)
      ? events.find((ev) => {
          const h = norm(ev.home_team);
          const a = norm(ev.away_team);
          const ok1 = h.includes(wantHome) || wantHome.includes(h);
          const ok2 = a.includes(wantAway) || wantAway.includes(a);
          const ok3 = h.includes(wantAway) || wantAway.includes(h);
          const ok4 = a.includes(wantHome) || wantHome.includes(a);
          return (ok1 && ok2) || (ok3 && ok4);
        }) ?? null
      : null;
    if (!target) {
      return NextResponse.json({ available: false, reason: "no matching event" });
    }

    const byMarket = { h2h: {}, btts: {}, totals: {} };
    const tops = { h2h: { home: [], draw: [], away: [] }, btts: { yes: [], no: [] }, totals: {} };
    const books = Array.isArray(target?.bookmakers) ? target.bookmakers : [];
    books.forEach((bk) => {
      const rawKey = String(bk?.key ?? bk?.title ?? "");
      const key = norm(rawKey);
      const name = rawKey || key;
      const markets = Array.isArray(bk?.markets) ? bk.markets : [];
      markets.forEach((m) => {
        const mKey = String(m?.key ?? "").toLowerCase();
        const outcomes = Array.isArray(m?.outcomes) ? m.outcomes : [];
        if (mKey === "h2h") {
          const rec = { home: null, draw: null, away: null };
          outcomes.forEach((o) => {
            const n = String(o?.name ?? "").toLowerCase();
            if (n.includes("home")) rec.home = Number(o?.price ?? NaN);
            else if (n === "draw" || n.includes("draw")) rec.draw = Number(o?.price ?? NaN);
            else if (n.includes("away")) rec.away = Number(o?.price ?? NaN);
          });
          byMarket.h2h[name] = rec;
          if (Number.isFinite(rec.home)) tops.h2h.home.push({ book: name, price: rec.home });
          if (Number.isFinite(rec.draw)) tops.h2h.draw.push({ book: name, price: rec.draw });
          if (Number.isFinite(rec.away)) tops.h2h.away.push({ book: name, price: rec.away });
        } else if (mKey === "btts") {
          const rec = { yes: null, no: null };
          outcomes.forEach((o) => {
            const n = String(o?.name ?? "").toLowerCase();
            if (n.startsWith("y")) rec.yes = Number(o?.price ?? NaN);
            if (n.startsWith("n")) rec.no = Number(o?.price ?? NaN);
          });
          byMarket.btts[name] = rec;
          if (Number.isFinite(rec.yes)) tops.btts.yes.push({ book: name, price: rec.yes });
          if (Number.isFinite(rec.no)) tops.btts.no.push({ book: name, price: rec.no });
        } else if (mKey === "totals") {
          outcomes.forEach((o) => {
            const p = o?.point ?? m?.point ?? null;
            if (p === null || p === undefined) return;
            const keyLine = String(Number(p));
            if (!byMarket.totals[keyLine]) byMarket.totals[keyLine] = {};
            if (!byMarket.totals[keyLine][name])
              byMarket.totals[keyLine][name] = { over: null, under: null };
            const n = String(o?.name ?? "").toLowerCase();
            const price = Number(o?.price ?? NaN);
            if (n.includes("over")) byMarket.totals[keyLine][name].over = price;
            if (n.includes("under")) byMarket.totals[keyLine][name].under = price;
            if (!tops.totals[keyLine]) tops.totals[keyLine] = { over: [], under: [] };
            if (n.includes("over") && Number.isFinite(price))
              tops.totals[keyLine].over.push({ book: name, price });
            if (n.includes("under") && Number.isFinite(price))
              tops.totals[keyLine].under.push({ book: name, price });
          });
        }
      });
    });

    // Sort and keep top 3 by best price (highest decimal odds)
    function sortTop(arr) {
      return arr.sort((a, b) => (b.price ?? 0) - (a.price ?? 0)).slice(0, 3);
    }
    tops.h2h.home = sortTop(tops.h2h.home);
    tops.h2h.draw = sortTop(tops.h2h.draw);
    tops.h2h.away = sortTop(tops.h2h.away);
    tops.btts.yes = sortTop(tops.btts.yes);
    tops.btts.no = sortTop(tops.btts.no);
    Object.keys(tops.totals).forEach((ln) => {
      tops.totals[ln].over = sortTop(tops.totals[ln].over);
      tops.totals[ln].under = sortTop(tops.totals[ln].under);
    });

    return NextResponse.json({
      available: true,
      byMarket,
      tops,
    });
  } catch (_e) {
    return NextResponse.json({ available: false });
  }
}
