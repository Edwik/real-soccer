const SPORTSDB_BASE_URL = "https://www.thesportsdb.com/api/v1/json/3";

function buildUrl(path, searchParams) {
  const url = new URL(`${SPORTSDB_BASE_URL}${path}`);
  if (searchParams && typeof searchParams === "object") {
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      url.searchParams.set(key, String(value));
    });
  }
  return url;
}

export async function sportsdbFetchJson(path, { searchParams } = {}) {
  const url = buildUrl(path, searchParams);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const error = new Error(
        `TheSportsDB HTTP ${res.status} al consultar ${url.pathname}${url.search}`,
      );
      error.status = res.status;
      error.body = text;
      throw error;
    }

    return await res.json();
  } catch (err) {
    if (err?.name === "AbortError") {
      const timeoutError = new Error(
        `Timeout consultando TheSportsDB: ${url.pathname}${url.search}`,
      );
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

