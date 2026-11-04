import { describe, expect, jest, test } from '@jest/globals';
import { buildTakeHomeQuery, channel3Enabled, parseSearchResponse, searchTakeHome } from '../../src/channel3/client';

describe('channel3 query building', () => {
  test('uses only a fixed phrase per category, never free text', () => {
    expect(buildTakeHomeQuery(['drinks', 'drinks', 'desserts'])).toBe('whole bean coffee');
    expect(buildTakeHomeQuery(['unknown'])).toBeNull();
    expect(buildTakeHomeQuery([])).toBeNull();
  });
  test('ties resolve deterministically', () => {
    expect(buildTakeHomeQuery(['gifts', 'drinks'])).toBe(buildTakeHomeQuery(['drinks', 'gifts']));
  });
  test('enabled only with a plausible key', () => {
    expect(channel3Enabled({} as any)).toBe(false);
    expect(channel3Enabled({ CHANNEL3_API_KEY: '  ' } as any)).toBe(false);
    expect(channel3Enabled({ CHANNEL3_API_KEY: 'abcdefgh12' } as any)).toBe(true);
  });
});

describe('parseSearchResponse', () => {
  const body = {
    products: [
      {
        id: 'p1', title: 'Beans 1kg', brand: { name: 'Roastery' }, images: [{ url: 'https://img.example/a.jpg' }],
        offers: [
          { merchant_domain: 'a.example', price: 30, currency: 'EUR', availability: 'OutOfStock', url: 'https://a.example/x' },
          { domain: 'b.example', price: 34, currency: 'EUR', availability: 'InStock', url: 'https://b.example/y' },
          { merchant_domain: 'evil.example', price: 1, currency: 'EUR', availability: 'InStock', url: 'javascript:alert(1)' },
        ],
      },
      { id: 'p2', title: 'No safe link', offers: [{ price: 1, url: 'http://insecure.example' }] },
      { title: 'No id', offers: [{ url: 'https://x.example' }] },
    ],
  };
  test('prefers in-stock, accepts both domain field names, drops unsafe or incomplete items', () => {
    const items = parseSearchResponse(body);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'p1', merchantDomain: 'b.example', price: 34, url: 'https://b.example/y', brand: 'Roastery' });
    expect(JSON.stringify(items)).not.toMatch(/javascript:|http:\/\//);
  });
  test('garbage input yields an empty list, never a throw', () => {
    expect(parseSearchResponse(null)).toEqual([]);
    expect(parseSearchResponse({ products: 'x' })).toEqual([]);
  });
  test('respects the limit', () => {
    const many = { products: Array.from({ length: 20 }, (_, i) => ({ id: 'i' + i, title: 't' + i, offers: [{ url: 'https://x.example/' + i }] })) };
    expect(parseSearchResponse(many, 3)).toHaveLength(3);
  });
});

describe('searchTakeHome', () => {
  test('sends the key as a header and a fixed JSON body', async () => {
    const f = (jest.fn() as any).mockResolvedValue({ ok: true, json: async () => ({ products: [] }) });
    await searchTakeHome('whole bean coffee', { apiKey: 'k-12345678', fetchImpl: f as any, limit: 4 });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api.trychannel3.com/v1/search');
    expect(init.headers['x-api-key']).toBe('k-12345678');
    expect(JSON.parse(init.body)).toEqual({ query: 'whole bean coffee', limit: 4 });
  });
  test('upstream failure becomes a Channel3Error without leaking the key', async () => {
    const f = (jest.fn() as any).mockResolvedValue({ ok: false, status: 401 });
    await expect(searchTakeHome('q', { apiKey: 'secret-key-1', fetchImpl: f as any })).rejects.toThrow(/401/);
    const g = (jest.fn() as any).mockRejectedValue(new Error('boom secret-key-1'));
    await expect(searchTakeHome('q', { apiKey: 'secret-key-1', fetchImpl: g as any })).rejects.not.toThrow(/secret-key-1/);
  });
});
