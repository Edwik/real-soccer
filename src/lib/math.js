export function clampNumber(value, { min = -Infinity, max = Infinity } = {}) {
  const n = Number(value);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function roundPct(prob, decimals = 1) {
  return Number((clampNumber(prob, { min: 0, max: 1 }) * 100).toFixed(decimals));
}

export function factorial(n) {
  if (n < 0) return NaN;
  if (n === 0) return 1;
  let acc = 1;
  for (let i = 2; i <= n; i += 1) acc *= i;
  return acc;
}

export function poissonPmf(k, lambda) {
  const kk = Math.max(0, Math.floor(k));
  const l = Math.max(0, Number(lambda));
  return (Math.exp(-l) * Math.pow(l, kk)) / factorial(kk);
}

export function buildPoissonArray(lambda, maxGoals = 6) {
  const arr = [];
  for (let k = 0; k <= maxGoals; k += 1) arr.push(poissonPmf(k, lambda));
  const sum = arr.reduce((a, b) => a + b, 0);
  return sum > 0 ? arr.map((p) => p / sum) : arr;
}

export function buildScoreMatrix(lambdaHome, lambdaAway, maxGoals = 6) {
  const ph = buildPoissonArray(lambdaHome, maxGoals);
  const pa = buildPoissonArray(lambdaAway, maxGoals);
  const matrix = [];
  for (let i = 0; i <= maxGoals; i += 1) {
    const row = [];
    for (let j = 0; j <= maxGoals; j += 1) {
      row.push(ph[i] * pa[j]);
    }
    matrix.push(row);
  }
  return matrix;
}

export function sumMatrixWhere(matrix, predicate) {
  let acc = 0;
  for (let i = 0; i < matrix.length; i += 1) {
    for (let j = 0; j < matrix[i].length; j += 1) {
      if (predicate(i, j)) acc += matrix[i][j];
    }
  }
  return acc;
}
