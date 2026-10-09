import catalogData from './data.json';

export interface Product {
  id: string;
  name: string;
  description: string;
  priceMinor: number;
  currency: string;
  category: string;
  tags: string[];
  dietary: string[];
  occasion: string[];
  available: boolean;
}

export interface CatalogQuery {
  query?: string;
  category?: string;
  tags?: string[];
  dietary?: string[];
  occasion?: string[];
  maxPriceMinor?: number;
  matchMode?: 'all' | 'any';
}

export class CatalogService {
  private products: Product[] = catalogData.products;

  getAll(): Product[] {
    return this.products.filter((p) => p.available);
  }

  getById(id: string): Product | undefined {
    return this.products.find((p) => p.id === id && p.available);
  }

  search(query: CatalogQuery): Product[] {
    let results = this.getAll();
    const matchMode = query.matchMode || 'all';

    if (query.category) {
      results = results.filter((p) => p.category === query.category);
    }

    if (query.query?.trim()) {
      const ignoredWords = new Set([
        'a', 'an', 'and', 'for', 'i', 'in', 'me', 'my', 'of', 'or', 'the',
        'to', 'with', 'under', 'over', 'find', 'get', 'need', 'want',
      ]);
      const terms = query.query
        .toLocaleLowerCase()
        .split(/[^\p{L}\p{N}-]+/u)
        .filter((term) => term.length > 2 && !ignoredWords.has(term));

      if (terms.length > 0) {
        results = results.filter((product) => {
          const searchableText = [
            product.id,
            product.name,
            product.description,
            product.category,
            ...product.tags,
            ...product.dietary,
            ...product.occasion,
          ]
            .join(' ')
            .toLocaleLowerCase();
          return terms.some((term) => searchableText.includes(term));
        });
      }
    }

    if (query.tags && query.tags.length > 0) {
      results =
        matchMode === 'all'
          ? results.filter((p) => query.tags!.every((tag) => p.tags.includes(tag)))
          : results.filter((p) => query.tags!.some((tag) => p.tags.includes(tag)));
    }

    if (query.dietary && query.dietary.length > 0) {
      results =
        matchMode === 'all'
          ? results.filter((p) => query.dietary!.every((d) => p.dietary.includes(d)))
          : results.filter((p) => query.dietary!.some((d) => p.dietary.includes(d)));
    }

    if (query.occasion && query.occasion.length > 0) {
      results =
        matchMode === 'all'
          ? results.filter((p) => query.occasion!.every((o) => p.occasion.includes(o)))
          : results.filter((p) => query.occasion!.some((o) => p.occasion.includes(o)));
    }

    // CRITICAL FIX #15: use !== undefined (not a truthy check) so that
    // maxPriceMinor === 0 is honored instead of being skipped.
    if (query.maxPriceMinor !== undefined) {
      results = results.filter((p) => p.priceMinor <= query.maxPriceMinor!);
    }

    return results;
  }
}
