import OpenAI from 'openai';
import { CatalogService } from '../catalog/service';

// Categories come from the configured catalog (AI Café or a custom business profile).
const CATEGORIES = new CatalogService().getCategories();

// 3 tools the AI is allowed to call. Pricing/checkout/payment are deliberately
// absent — the AI can only discover and prepare, never pay.
export const AI_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_products',
      description: 'Search the merchant catalog by category, tags, dietary restrictions, occasion, or price range',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Natural language search query (e.g., "healthy breakfast", "vegetarian options")',
          },
          category: {
            type: 'string',
            enum: CATEGORIES,
            description: 'Product category',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Product tags (e.g., ["hot", "caffeine"])',
          },
          dietary: {
            type: 'array',
            items: { type: 'string' },
            description: 'Dietary restrictions (e.g., ["vegetarian", "vegan", "gluten-free"])',
          },
          occasion: {
            type: 'array',
            items: { type: 'string' },
            description: 'Occasion (e.g., ["breakfast", "birthday", "gift"])',
          },
          maxPriceMinor: {
            type: 'integer',
            description:
              'Maximum unit price in minor units (e.g., 1500 = 15.00 EUR)',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_product_details',
      description: 'Get detailed information about a specific product',
      parameters: {
        type: 'object',
        properties: {
          productId: {
            type: 'string',
            description: 'Product ID (e.g., "veg_breakfast", "coffee")',
          },
        },
        required: ['productId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_cart',
      description:
        'Prepare a shopping cart with selected products and quantities. Returns authoritative catalog pricing and enforces the requested total budget.',
      parameters: {
        type: 'object',
        properties: {
          maxBudgetMinor: {
            type: 'integer',
            minimum: 0,
            description:
              'Maximum total cart budget in minor currency units (e.g., 2000 = 20.00 EUR), only when the user specifies a budget',
          },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                productId: {
                  type: 'string',
                  description: 'Product ID',
                },
                quantity: {
                  type: 'integer',
                  description: 'Quantity (1-100)',
                  minimum: 1,
                  maximum: 100,
                },
              },
              required: ['productId', 'quantity'],
            },
            description: 'List of items to add to cart',
          },
        },
        required: ['items'],
      },
    },
  },
];

// Hardcoded allowlist - the AI can ONLY call these tools. Payment tools are
// intentionally NOT in this list, enforcing the safety boundary structurally.
export const ALLOWED_TOOLS = ['search_products', 'get_product_details', 'prepare_cart'] as const;
