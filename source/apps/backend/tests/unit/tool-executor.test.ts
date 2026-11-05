import { executeTool } from '../../src/ai/tool-executor';

describe('AI Tool Executor', () => {
  test('search_products returns filtered results', async () => {
    const result = await executeTool('search_products', {
      query: 'vegetarian breakfast',
      dietary: ['vegetarian'],
      category: 'breakfast',
    });

    expect(result.count).toBeGreaterThan(0);
    expect(result.products.every((p: any) => p.dietary.includes('vegetarian'))).toBe(true);
  });

  test('shopper dietary preferences filter discovery results', async () => {
    const result = await executeTool(
      'search_products',
      { query: 'breakfast' },
      { dietary: ['vegan'] }
    );

    expect(result.products.length).toBeGreaterThan(0);
    expect(result.products.every((product: any) => product.dietary.includes('vegan'))).toBe(true);
  });

  test('dietary preferences do not exclude non-food products', async () => {
    const result = await executeTool(
      'search_products',
      { query: 'flowers' },
      { dietary: ['vegan'] }
    );

    expect(result.products.map((product: any) => product.id)).toContain(
      'flowers_bouquet'
    );
  });

  test('shopper dietary preferences are enforced when preparing carts', async () => {
    await expect(
      executeTool(
        'prepare_cart',
        { items: [{ productId: 'veg_breakfast', quantity: 1 }] },
        { dietary: ['vegan'] }
      )
    ).rejects.toThrow('does not meet the shopper');
  });

  test('shopper budget is enforced even if the model omits its budget argument', async () => {
    await expect(
      executeTool(
        'prepare_cart',
        { items: [{ productId: 'veg_breakfast', quantity: 1 }] },
        { dietary: [], maxBudgetMinor: 500 }
      )
    ).rejects.toThrow('exceeds the maximum budget');
  });

  test('search_products uses natural-language query terms', async () => {
    const result = await executeTool('search_products', { query: 'chocolate' });

    expect(result.products.map((product: any) => product.id)).toContain(
      'premium_cake'
    );
    expect(result.products.map((product: any) => product.id)).not.toContain(
      'coffee'
    );
  });

  test('get_product_details returns product', async () => {
    const result = await executeTool('get_product_details', {
      productId: 'coffee',
    });

    expect(result.id).toBe('coffee');
    expect(result.name).toBe('Fresh Brewed Coffee');
    expect(result.priceMinor).toBe(300);
  });

  test('prepare_cart calculates total correctly (backend-authoritative pricing)', async () => {
    const result = await executeTool('prepare_cart', {
      items: [
        { productId: 'coffee', quantity: 2 },
        { productId: 'veg_breakfast', quantity: 1 },
      ],
    });

    expect(result.items).toHaveLength(2);
    expect(result.totalMinor).toBe(1600);
    expect(result.totalFormatted).toBe('€16.00');
  });

  test('prepare_cart rejects duplicate products', async () => {
    await expect(
      executeTool('prepare_cart', {
        items: [
          { productId: 'coffee', quantity: 1 },
          { productId: 'coffee', quantity: 2 },
        ],
      })
    ).rejects.toThrow('Duplicate product');
  });

  test('prepare_cart rejects a cart over the requested total budget', async () => {
    await expect(
      executeTool('prepare_cart', {
        maxBudgetMinor: 1500,
        items: [{ productId: 'veg_breakfast', quantity: 2 }],
      })
    ).rejects.toThrow('exceeds the maximum budget');
  });

  test('unknown tool rejected (safety boundary)', async () => {
    await expect(
      executeTool('create_paypal_order', { orderId: '123' })
    ).rejects.toThrow('Unknown tool');
  });
});
