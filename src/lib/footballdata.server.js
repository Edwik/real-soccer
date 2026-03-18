const FOOTBALL_DATA_BASE_URL = "https://api.football-data.org/v4";

function buildUrl(path, searchParams) {
  const url = new URL(`${FOOTBALL_DATA_BASE_URL}${path}`);
  if (searchParams && typeof searchParams === "object") {
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      url.searchParams.set(key, String(value));
    });
  }
  return url;
}

export async function footballDataFetchJson(path, { searchParams } = {}) {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    const err = new Error(
      "Falta configurar FOOTBALL_DATA_TOKEN para consultar football-data.org",
    );
    err.status = 501;
    throw err;
  }

  const url = buildUrl(path, searchParams);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        "X-Auth-Token": token,
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const error = new Error(
        `football-data.org HTTP ${res.status} al consultar ${url.pathname}${url.search}`,
      );
      error.status = res.status;
      error.body = text;
      throw error;
    }

    return await res.json();
  } catch (err) {
    if (err?.name === "AbortError") {
      const timeoutError = new Error(
        `Timeout consultando football-data.org: ${url.pathname}${url.search}`,
      );
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

