// Channel3 "Take it home" suggestions.
//
// Channel3 (https://docs.trychannel3.com) is a cross-retailer product search API. We use it for ONE thing:
// after the shopper has a café order, suggest related products to keep at home (beans, tea, a mug) with
// links to the RETAILER'S own page.
//
// Trust boundary, on purpose:
//   - These are outbound links. They are NOT part of the PayPal cart, NOT covered by the Spending Mandate,
//     and the agent cannot buy them. Nothing here can create an order or move money.
//   - The API key stays on the server. The browser/app only ever talks to our own route.
//   - Only https URLs and a small allow-list of fields leave this module; everything else is dropped.
//   - Disabled (and honest about it) when CHANNEL3_API_KEY is not set.
//
// Response shape: Channel3's own docs show offers with `merchant_domain` in some pages and `domain` in
// others, and a price that is a plain number. The parser accepts both and ignores anything unexpected,
// so a field rename degrades to "fewer suggestions", never to a crash or an unsafe link.

export const CHANNEL3_SEARCH_URL = 'https://api.trychannel3.com/v1/search';

export interface TakeHomeItem {
  id: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  merchantDomain: string | null;
  price: number | null;
  currency: string | null;
  availability: string | null;
  url: string;
}

export interface Channel3Options {
  apiKey: string;
  fetchImpl?: typeof fetch;
  limit?: number;
  timeoutMs?: number;
}

export function channel3Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return typeof env.CHANNEL3_API_KEY === 'string' && env.CHANNEL3_API_KEY.trim().length >= 8;
}

// Category -> a plain-language search phrase. Deliberately small and fixed: no user text is ever sent
// to Channel3, so the shopper cannot use this route as a general product-search proxy.
const CATEGORY_QUERY: Record<string, string> = {
  drinks: 'whole bean coffee',
  breakfast: 'breakfast tea and coffee gift set',
  desserts: 'dessert plate set',
  gifts: 'coffee mug gift',
  lunch: 'lunch box',
  snacks: 'healthy snack box',
  catering: 'coffee maker',
};

/** Builds a fixed query from the categories of products in the cart. Pure. Returns null if nothing maps. */
export function buildTakeHomeQuery(categories: string[]): string | null {
  const counts = new Map<string, number>();
  for (const c of categories) if (CATEGORY_QUERY[c]) counts.set(c, (counts.get(c) ?? 0) + 1);
  if (counts.size === 0) return null;
  // Most frequent category wins; ties resolve alphabetically so the result is deterministic.
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  return CATEGORY_QUERY[top];
}

function httpsUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 2048) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function str(v: unknown, max = 200): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

/** Defensive parser for POST /v1/search. Exported for tests. */
export function parseSearchResponse(body: unknown, limit = 6): TakeHomeItem[] {
  const products = (body as any)?.products;
  if (!Array.isArray(products)) return [];
  const out: TakeHomeItem[] = [];
  for (const p of products) {
    if (out.length >= limit) break;
    const title = str(p?.title);
    const id = str(p?.id, 80);
    const offers: any[] = Array.isArray(p?.offers) ? p.offers : [];
    // Prefer an in-stock offer, then the cheapest priced one; skip offers without a safe https URL.
    const usable = offers
      .map((o) => ({ o, url: httpsUrl(o?.url) }))
      .filter((x) => x.url !== null);
    if (!title || !id || usable.length === 0) continue;
    usable.sort((a, b) => {
      const sa = a.o?.availability === 'InStock' ? 0 : 1;
      const sb = b.o?.availability === 'InStock' ? 0 : 1;
      if (sa !== sb) return sa - sb;
      const pa = typeof a.o?.price === 'number' ? a.o.price : Infinity;
      const pb = typeof b.o?.price === 'number' ? b.o.price : Infinity;
      return pa - pb;
    });
    const best = usable[0];
    const image = Array.isArray(p?.images) ? httpsUrl(p.images[0]?.url) : null;
    out.push({
      id,
      title,
      brand: str(p?.brand?.name, 80) ?? (Array.isArray(p?.brands) ? str(p.brands[0]?.name, 80) : null),
      imageUrl: image,
      merchantDomain: str(best.o?.merchant_domain ?? best.o?.domain, 120),
      price: typeof best.o?.price === 'number' && isFinite(best.o.price) ? best.o.price : null,
      currency: str(best.o?.currency, 3),
      availability: str(best.o?.availability, 40),
      url: best.url as string,
    });
  }
  return out;
}

export class Channel3Error extends Error {}

export async function searchTakeHome(query: string, opts: Channel3Options): Promise<TakeHomeItem[]> {
  const f = opts.fetchImpl ?? fetch;
  const limit = Math.min(Math.max(opts.limit ?? 6, 1), 12);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 6000);
  try {
    const res = await f(CHANNEL3_SEARCH_URL, {
      method: 'POST',
      headers: { 'x-api-key': opts.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ query, limit }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Channel3Error(`Channel3 responded ${res.status}`);
    return parseSearchResponse(await res.json(), limit);
  } catch (e) {
    if (e instanceof Channel3Error) throw e;
    throw new Channel3Error('Channel3 request failed');
  } finally {
    clearTimeout(timer);
  }
}
