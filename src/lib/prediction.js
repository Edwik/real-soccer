import { buildScoreMatrix, roundPct, sumMatrixWhere } from "./math";

const DEFAULT_MAX_GOALS = 6;
const DEFAULT_PRIOR_GOALS_MEAN = 1.25;
const DEFAULT_PRIOR_WEIGHT_MATCHES = 3;

export function shrinkMean({
  sum,
  n,
  priorMean = DEFAULT_PRIOR_GOALS_MEAN,
  priorWeightMatches = DEFAULT_PRIOR_WEIGHT_MATCHES,
}) {
  const nn = Math.max(0, n);
  const w = Math.max(0, priorWeightMatches);
  return (sum + priorMean * w) / (nn + w || 1);
}

export function summarizeTeamMatches(teamMatches) {
  const finished = teamMatches.filter((m) => m.isFinished);
  const w = finished.filter((m) => m.result === "W").length;
  const d = finished.filter((m) => m.result === "D").length;
  const l = finished.filter((m) => m.result === "L").length;
  const gf = finished.reduce((a, m) => a + m.goalsFor, 0);
  const ga = finished.reduce((a, m) => a + m.goalsAgainst, 0);
  const points = w * 3 + d;
  const played = finished.length || 1;

  return {
    played: finished.length,
    w,
    d,
    l,
    points,
    ppg: Number((points / played).toFixed(2)),
    gf,
    ga,
    gfAvg: Number((gf / played).toFixed(2)),
    gaAvg: Number((ga / played).toFixed(2)),
  };
}

export function buildTeamMatchRecordFromEvent({ event, teamId }) {
  const isHome =
    String(event?.homeTeam?.id ?? "") === String(teamId ?? "");
  const isAway =
    String(event?.awayTeam?.id ?? "") === String(teamId ?? "");
  if (!isHome && !isAway) return null;

  const homeName = event?.homeTeam?.name ?? null;
  const awayName = event?.awayTeam?.name ?? null;
  const homeId = event?.homeTeam?.id ?? null;
  const awayId = event?.awayTeam?.id ?? null;
  const homeLogo = Number.isFinite(homeId)
    ? `https://api.sofascore.app/api/v1/team/${homeId}/image`
    : null;
  const awayLogo = Number.isFinite(awayId)
    ? `https://api.sofascore.app/api/v1/team/${awayId}/image`
    : null;

  const statusType = event?.status?.type;
  const isFinished = statusType === "finished";
  const homeGoals = event?.homeScore?.current;
  const awayGoals = event?.awayScore?.current;

  const safeHome = Number.isFinite(homeGoals) ? homeGoals : null;
  const safeAway = Number.isFinite(awayGoals) ? awayGoals : null;

  const goalsFor = isHome ? safeHome : safeAway;
  const goalsAgainst = isHome ? safeAway : safeHome;

  let result = "N/A";
  if (isFinished && goalsFor !== null && goalsAgainst !== null) {
    if (goalsFor > goalsAgainst) result = "W";
    else if (goalsFor === goalsAgainst) result = "D";
    else result = "L";
  }

  return {
    eventId: event?.id,
    startTimestamp: event?.startTimestamp,
    tournament: event?.tournament?.name,
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

export function computeExpectedGoals({
  homeTeamMatches,
  awayTeamMatches,
  priorMean = DEFAULT_PRIOR_GOALS_MEAN,
  priorWeightMatches = DEFAULT_PRIOR_WEIGHT_MATCHES,
}) {
  const homeHome = homeTeamMatches.filter((m) => m.isHome && m.isFinished);
  const awayAway = awayTeamMatches.filter((m) => m.isAway && m.isFinished);

  const homeAttack = shrinkMean({
    sum: homeHome.reduce((a, m) => a + m.goalsFor, 0),
    n: homeHome.length,
    priorMean,
    priorWeightMatches,
  });
  const homeDefense = shrinkMean({
    sum: homeHome.reduce((a, m) => a + m.goalsAgainst, 0),
    n: homeHome.length,
    priorMean,
    priorWeightMatches,
  });

  const awayAttack = shrinkMean({
    sum: awayAway.reduce((a, m) => a + m.goalsFor, 0),
    n: awayAway.length,
    priorMean,
    priorWeightMatches,
  });
  const awayDefense = shrinkMean({
    sum: awayAway.reduce((a, m) => a + m.goalsAgainst, 0),
    n: awayAway.length,
    priorMean,
    priorWeightMatches,
  });

  const lambdaHome = (homeAttack + awayDefense) / 2;
  const lambdaAway = (awayAttack + homeDefense) / 2;

  return {
    lambdaHome: Number(lambdaHome.toFixed(3)),
    lambdaAway: Number(lambdaAway.toFixed(3)),
    inputs: {
      homeHomePlayed: homeHome.length,
      awayAwayPlayed: awayAway.length,
      homeAttack: Number(homeAttack.toFixed(3)),
      homeDefense: Number(homeDefense.toFixed(3)),
      awayAttack: Number(awayAttack.toFixed(3)),
      awayDefense: Number(awayDefense.toFixed(3)),
      priorMean,
      priorWeightMatches,
    },
  };
}

export function computeMarketsFromExpectedGoals({
  lambdaHome,
  lambdaAway,
  maxGoals = DEFAULT_MAX_GOALS,
}) {
  const matrix = buildScoreMatrix(lambdaHome, lambdaAway, maxGoals);

  const pHomeWin = sumMatrixWhere(matrix, (h, a) => h > a);
  const pDraw = sumMatrixWhere(matrix, (h, a) => h === a);
  const pAwayWin = sumMatrixWhere(matrix, (h, a) => h < a);

  const pHome0 = sumMatrixWhere(matrix, (h) => h === 0);
  const pAway0 = sumMatrixWhere(matrix, (_, a) => a === 0);
  const p00 = matrix[0]?.[0] ?? 0;
  const pBTTSYes = 1 - pHome0 - pAway0 + p00;

  function pTotalOver(line) {
    return sumMatrixWhere(matrix, (h, a) => h + a > line);
  }
  function pTotalUnder(line) {
    return sumMatrixWhere(matrix, (h, a) => h + a < line);
  }

  function pHomeHandicapGreaterThan(line) {
    return sumMatrixWhere(matrix, (h, a) => h - a > line);
  }

  const p1X = pHomeWin + pDraw;
  const pX2 = pAwayWin + pDraw;
  const p12 = pHomeWin + pAwayWin;

  const pDnbHome = pHomeWin / (pHomeWin + pAwayWin || 1);
  const pDnbAway = pAwayWin / (pHomeWin + pAwayWin || 1);

  const totals = [0.5, 1.5, 2.5, 3.5, 4.5].map((line) => ({
    line,
    over: pTotalOver(line),
    under: pTotalUnder(line),
  }));

  const handicaps = [-1.5, -1, -0.5, 0.5, 1, 1.5].map((line) => ({
    line,
    homeCover: pHomeHandicapGreaterThan(line),
    awayCover: 1 - pHomeHandicapGreaterThan(line),
  }));

  return {
    inputs: { lambdaHome, lambdaAway, maxGoals },
    oneXtwo: {
      home: pHomeWin,
      draw: pDraw,
      away: pAwayWin,
    },
    drawNoBet: {
      home: pDnbHome,
      away: pDnbAway,
      draw: pDraw,
    },
    doubleChance: {
      "1X": p1X,
      X2: pX2,
      "12": p12,
    },
    btts: {
      yes: pBTTSYes,
      no: 1 - pBTTSYes,
    },
    totals,
    handicaps,
    pretty: {
      oneXtwoPct: {
        home: roundPct(pHomeWin),
        draw: roundPct(pDraw),
        away: roundPct(pAwayWin),
      },
      doubleChancePct: {
        "1X": roundPct(p1X),
        X2: roundPct(pX2),
        "12": roundPct(p12),
      },
      bttsPct: {
        yes: roundPct(pBTTSYes),
        no: roundPct(1 - pBTTSYes),
      },
    },
  };
}

export function buildRecommendationBundle(markets) {
  const candidates = [];

  candidates.push({
    code: "1X",
    name: "Doble oportunidad 1X",
    probability: markets.doubleChance["1X"],
    rationale:
      "Cubre victoria local o empate, útil para apuestas conservadoras cuando el local no pierde frecuentemente.",
  });
  candidates.push({
    code: "X2",
    name: "Doble oportunidad X2",
    probability: markets.doubleChance["X2"],
    rationale:
      "Cubre victoria visitante o empate, útil cuando el visitante muestra buena solidez fuera de casa.",
  });
  candidates.push({
    code: "BTTS_NO",
    name: "Ambos anotan: NO",
    probability: markets.btts.no,
    rationale:
      "Favorece partidos donde al menos un equipo suele quedarse en 0 o concede poco.",
  });
  candidates.push({
    code: "U45",
    name: "Total inferior 4.5",
    probability: markets.totals.find((t) => t.line === 4.5)?.under ?? 0,
    rationale:
      "Mercado conservador para evitar marcadores muy atípicos; suele tener alta probabilidad.",
  });
  candidates.push({
    code: "O15",
    name: "Total superior 1.5",
    probability: markets.totals.find((t) => t.line === 1.5)?.over ?? 0,
    rationale:
      "Apuesta sencilla cuando se espera al menos 2 goles en el partido.",
  });

  const safe = [...candidates]
    .sort((a, b) => b.probability - a.probability)
    .filter((c) => c.probability >= 0.7)
    .slice(0, 4);

  const high = [...candidates]
    .sort((a, b) => a.probability - b.probability)
    .filter((c) => c.probability >= 0.35 && c.probability <= 0.6)
    .slice(0, 4);

  return { safe, high };
}
