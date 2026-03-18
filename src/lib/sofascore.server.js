const SOFASCORE_BASE_URL = "https://www.sofascore.com/api/v1";

export async function sofascoreFetchJson(path, { searchParams } = {}) {
  const url = new URL(`${SOFASCORE_BASE_URL}${path}`);

  if (searchParams && typeof searchParams === "object") {
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      url.searchParams.set(key, String(value));
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        "accept-language": "es-CO,es;q=0.9,en;q=0.8",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        referer: "https://www.sofascore.com/",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const error = new Error(
        `SofaScore HTTP ${res.status} al consultar ${url.pathname}${url.search}`,
      );
      error.status = res.status;
      error.body = text;
      throw error;
    }

    return await res.json();
  } catch (err) {
    if (err?.name === "AbortError") {
      const timeoutError = new Error(
        `Timeout consultando SofaScore: ${url.pathname}${url.search}`,
      );
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

