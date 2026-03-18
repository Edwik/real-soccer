"use client";

import Link from "next/link";
import Image from "next/image";
import { formatBogotaTimeFromUnixSeconds } from "@/lib/time";

function formatEventStatus(status) {
  const raw = String(status ?? "").trim();
  if (!raw) return "Programado";

  const upper = raw.toUpperCase();
  if (upper === "SCHEDULED" || upper === "TIMED") return "Programado";
  if (upper === "FINISHED") return "Finalizado";
  if (upper === "IN_PLAY" || upper === "INPLAY" || upper === "LIVE") return "En juego";
  if (upper === "PAUSED") return "Descanso";
  if (upper === "POSTPONED") return "Pospuesto";
  if (upper === "CANCELLED" || upper === "CANCELED") return "Cancelado";
  if (upper === "SUSPENDED") return "Suspendido";

  const lower = raw.toLowerCase();
  if (lower === "notstarted" || lower === "scheduled") return "Programado";
  if (lower === "finished") return "Finalizado";
  if (lower === "inprogress" || lower === "in_progress") return "En juego";

  if (lower === "full time" || lower === "ft") return "Finalizado";
  if (lower === "half time" || lower === "ht") return "Descanso";
  if (lower === "in progress") return "En juego";
  if (lower === "postponed") return "Pospuesto";
  if (lower === "canceled" || lower === "cancelled") return "Cancelado";
  if (lower === "suspended") return "Suspendido";
  if (lower === "delayed") return "Retrasado";

  return raw;
}

export function MatchCard({ event }) {
  const time = formatBogotaTimeFromUnixSeconds(event?.startTimestamp);
  const title = `${event?.homeTeam?.name ?? "Local"} vs ${
    event?.awayTeam?.name ?? "Visitante"
  }`;

  const homeName = event?.homeTeam?.name ?? "Local";
  const awayName = event?.awayTeam?.name ?? "Visitante";
  const homeLogo = event?.homeTeam?.logo ?? null;
  const awayLogo = event?.awayTeam?.logo ?? null;
  const homeInitial = String(homeName).trim().slice(0, 1).toUpperCase();
  const awayInitial = String(awayName).trim().slice(0, 1).toUpperCase();

  return (
    <Link
      href={`/match/${event.id}`}
      className="block rounded-2xl bg-slate-900/40 p-4 shadow-sm ring-1 ring-slate-800 transition hover:bg-slate-900/70"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <div className="h-9 w-9 overflow-hidden rounded-2xl bg-slate-950/40 ring-1 ring-slate-800">
              {homeLogo ? (
                <Image
                  src={homeLogo}
                  alt={homeName}
                  width={36}
                  height={36}
                  className="h-full w-full object-contain p-1"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-bold text-zinc-200">
                  {homeInitial}
                </div>
              )}
            </div>
            <div className="h-9 w-9 overflow-hidden rounded-2xl bg-slate-950/40 ring-1 ring-slate-800">
              {awayLogo ? (
                <Image
                  src={awayLogo}
                  alt={awayName}
                  width={36}
                  height={36}
                  className="h-full w-full object-contain p-1"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-bold text-zinc-200">
                  {awayInitial}
                </div>
              )}
            </div>
          </div>
          <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{title}</div>
          <div className="mt-1 truncate text-xs text-zinc-400">
            {event?.tournament?.category ? `${event.tournament.category} · ` : ""}
            {event?.tournament?.name ?? "Competición"}
          </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold">{time}</div>
          <div className="mt-1 text-xs text-zinc-400">
            {formatEventStatus(event?.status)}
          </div>
        </div>
      </div>
    </Link>
  );
}
