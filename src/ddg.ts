import { getPreferenceValues } from "@raycast/api";

export interface Prefs {
  region: string;
  safesearch: "on" | "moderate" | "off";
  maxResults: string;
  columns: string;
  closeAfterCopy: boolean;
}

export interface ImageResult {
  title: string;
  image: string;
  thumbnail: string;
  url: string;
  width: number;
  height: number;
  source: string;
  domain: string;
}

export interface SearchOptions {
  type: string; // "" = any; transparent | clipart | line | photo | gif
  license: string; // "" = any; Public | Share | ShareCommercially | Modify | ModifyCommercially
}

export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const BASE_HEADERS = {
  "User-Agent": UA,
  "Accept-Language": "en-US,en;q=0.5",
};

const RATE_LIMIT_MSG = "DuckDuckGo is rate-limiting requests. Wait a minute and try again.";

/** Step 1: DuckDuckGo embeds a per-query token ("vqd") in its HTML page; the JSON endpoint requires it. */
async function getVqd(query: string): Promise<string> {
  const url = `https://duckduckgo.com/?${new URLSearchParams({ q: query, iax: "images", ia: "images" })}`;
  const res = await fetch(url, {
    headers: { ...BASE_HEADERS, Accept: "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 403 || res.status === 429) throw new Error(RATE_LIMIT_MSG);
  if (!res.ok) throw new Error(`DuckDuckGo returned HTTP ${res.status}`);
  const match = (await res.text()).match(/vqd=["']?([\d-]+)/);
  if (!match) throw new Error(`Could not get a search token from DuckDuckGo. ${RATE_LIMIT_MSG}`);
  return match[1];
}

interface RawResult {
  title?: string;
  image?: string;
  thumbnail?: string;
  url?: string;
  width?: number | string;
  height?: number | string;
  source?: string;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Step 2: query the JSON endpoint behind DuckDuckGo's image tab (~100 results per page). */
export async function searchImages(query: string, opts: SearchOptions): Promise<ImageResult[]> {
  const prefs = getPreferenceValues<Prefs>();
  const max = Number(prefs.maxResults) || 60;
  const vqd = await getVqd(query);

  const params = new URLSearchParams({
    o: "json",
    q: query,
    l: prefs.region || "wt-wt",
    vqd,
    p: prefs.safesearch === "off" ? "-1" : "1",
  });
  // Filter slots: time,size,color,type,layout,license
  if (opts.type || opts.license) {
    params.set("f", `,,,${opts.type ? `type:${opts.type}` : ""},,${opts.license ? `license:${opts.license}` : ""}`);
  }

  const res = await fetch(`https://duckduckgo.com/i.js?${params}`, {
    headers: {
      ...BASE_HEADERS,
      Accept: "application/json, text/javascript, */*; q=0.01",
      Referer: "https://duckduckgo.com/",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 403 || res.status === 429) throw new Error(RATE_LIMIT_MSG);
  if (!res.ok) throw new Error(`DuckDuckGo returned HTTP ${res.status}`);

  let json: { results?: RawResult[] };
  try {
    json = (await res.json()) as { results?: RawResult[] };
  } catch {
    throw new Error(`Unexpected response from DuckDuckGo. ${RATE_LIMIT_MSG}`);
  }

  const seen = new Set<string>();
  const out: ImageResult[] = [];
  for (const r of json.results ?? []) {
    if (!r.image || seen.has(r.image)) continue;
    seen.add(r.image);
    out.push({
      title: (r.title ?? "").trim(),
      image: r.image,
      thumbnail: r.thumbnail || r.image,
      url: r.url ?? "",
      width: Number(r.width) || 0,
      height: Number(r.height) || 0,
      source: r.source ?? "",
      domain: domainOf(r.url || r.image),
    });
    if (out.length >= max) break;
  }
  return out;
}
