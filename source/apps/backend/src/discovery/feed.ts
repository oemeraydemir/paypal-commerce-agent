import { CatalogService } from '../catalog/service';
import { currentBusiness } from '../config/business-config';

// Product feed for AI shopping agents: GET /api/feed/products.
//
// A "schema.org-style" JSON-LD ItemList of Product/Offer entries. It is a custom feed of this merchant's own
// catalog; it is NOT an official PayPal Store Sync feed. Prices are the server's catalog prices (the same
// objects checkout uses); only public catalog fields are exposed.
//
// Schema (stable; additive changes only):
//   ItemList { '@context', '@type', name, description, numberOfItems, itemListElement[] }
//   ListItem { '@type', position, item: Product }
//   Product  { '@type', sku, name, description, category, keywords, additionalProperty[], offers: Offer }
//     additionalProperty: PropertyValue name 'dietary' (value: string[]), 'priceMinor' (value: integer, minor units)
//   Offer    { '@type', price (decimal string), priceCurrency, availability (schema.org URL), seller, url }
// Dietary tags are catalog labels (e.g. "vegan", "alcohol"), not schema.org RestrictedDiet values.

const catalog = new CatalogService();
const major = (minor: number) => (minor / 100).toFixed(2);

export function buildProductFeed(base: string) {
  const products = catalog.getAll();
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${currentBusiness.name} product feed`,
    description: 'Custom schema.org-style feed of this merchant\'s own catalog. Not an official PayPal Store Sync feed.',
    numberOfItems: products.length,
    itemListElement: products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        sku: p.id,
        name: p.name,
        description: p.description,
        category: p.category,
        keywords: Array.from(new Set([...p.tags, ...p.occasion])).join(', '),
        additionalProperty: [
          { '@type': 'PropertyValue', name: 'dietary', value: p.dietary },
          { '@type': 'PropertyValue', name: 'priceMinor', value: p.priceMinor },
        ],
        offers: {
          '@type': 'Offer',
          price: major(p.priceMinor),
          priceCurrency: p.currency,
          availability: p.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          seller: { '@type': 'Organization', name: currentBusiness.name },
          url: `${base}/api/catalog/${encodeURIComponent(p.id)}`,
        },
      },
    })),
  };
}
