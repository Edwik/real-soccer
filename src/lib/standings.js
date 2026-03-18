export function findTeamStandingRow(standingsJson, teamId) {
  const rows = standingsJson?.standings?.[0]?.rows ?? standingsJson?.standings?.rows;
  if (!Array.isArray(rows)) return null;
  return rows.find((r) => r?.team?.id === teamId) ?? null;
}

export function summarizeStandingRow(row) {
  if (!row) return null;

  const promotion = row?.promotion;
  const promotionText =
    typeof promotion === "string"
      ? promotion
      : promotion?.text ?? promotion?.name ?? null;

  const matches = row?.matches ?? row?.played ?? null;
  const wins = row?.wins ?? null;
  const draws = row?.draws ?? null;
  const losses = row?.losses ?? null;

  return {
    position: row?.position ?? null,
    points: row?.points ?? null,
    matches,
    wins,
    draws,
    losses,
    goalsFor: row?.scoresFor ?? row?.goalsFor ?? null,
    goalsAgainst: row?.scoresAgainst ?? row?.goalsAgainst ?? null,
    goalDiff: row?.scoreDiff ?? row?.goalDifference ?? null,
    promotionText: promotionText ?? null,
  };
}
