import { explainChoiceLine } from '../../src/ai/explainer';

const base = {
  productId: 'caprese_panini',
  name: 'Caprese Panini',
  quantity: 1,
  totalMinor: 890,
  priceMinor: 890,
  currency: 'EUR',
  description: 'Mozzarella, tomato, basil pesto, pressed ciabatta',
  dietary: ['vegetarian'],
};

describe('recommendation explainer', () => {
  test('names the product with its server price, description, budget fit and an informational diet label', () => {
    const line = explainChoiceLine(1, base, { budgetMinor: 1200, currency: 'EUR', locale: 'en-DE', language: 'en' });
    expect(line).toMatch(/^1\. Caprese Panini — /);
    expect(line).toContain('Mozzarella');
    expect(line).toMatch(/Within your .* budget\./);
    expect(line).toMatch(/sample menu labels it vegetarian/);
    // never a verified allergen guarantee
    expect(line).not.toMatch(/allergen-free|safe for|guaranteed|suitable for/i);
  });

  test('says honestly when an option is over the budget', () => {
    const line = explainChoiceLine(2, { ...base, totalMinor: 1500, priceMinor: 1500 }, { budgetMinor: 1200, currency: 'EUR', locale: 'en-DE', language: 'en' });
    expect(line).toMatch(/over your .* budget\./);
    expect(line).not.toMatch(/Within your/);
  });

  test('omits the budget sentence when no budget is known', () => {
    const line = explainChoiceLine(1, base, { currency: 'EUR', locale: 'en-DE', language: 'en' });
    expect(line).not.toMatch(/budget\./);
  });

  test('does not invent ingredients when description or labels are missing', () => {
    const line = explainChoiceLine(1, { ...base, description: undefined, dietary: [] }, { currency: 'EUR', locale: 'en-DE', language: 'en' });
    expect(line).toMatch(/menu option matching your request\./);
    expect(line).not.toMatch(/Mozzarella/);
    expect(line).not.toMatch(/sample menu labels/);
  });

  test('Turkish variant uses Turkish phrases and keeps the informational framing', () => {
    const line = explainChoiceLine(1, base, { budgetMinor: 1200, currency: 'EUR', locale: 'tr-TR', language: 'tr' });
    expect(line).toMatch(/bütçenizin içinde\./);
    expect(line).toMatch(/Menüde vegetarian olarak işaretli/);
  });
});
