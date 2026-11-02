import { buildCatalogDiscovery, parseOptionSelection, profileSignature } from '../../src/ai/catalog-discovery';
describe('catalog discovery options',()=>{
  test('returns real vegetarian breakfast choices within a two-person €20 budget',()=>{
    const r=buildCatalogDiscovery('Vegetarian breakfast for two under €20',{dietary:[],maxBudgetMinor:2000});
    expect(r).not.toBeNull(); expect(r!.quantity).toBe(2); expect(r!.effectivePreferences.dietary).toContain('vegetarian');
    expect(r!.options.length).toBeGreaterThanOrEqual(2); expect(r!.options.length).toBeLessThanOrEqual(4);
    expect(r!.options.every(o=>o.totalMinor<=2000)).toBe(true);
  });
  test('applies a vegan profile and Turkish quantity',()=>{
    const r=buildCatalogDiscovery('2 kişilik kahvaltı',{dietary:['vegan'],maxBudgetMinor:2000});
    expect(r).not.toBeNull(); expect(r!.language).toBe('tr'); expect(r!.quantity).toBe(2);
    expect(r!.options.every(o=>['avocado_toast','oat_porridge'].includes(o.productId))).toBe(true);
  });
  test('does not replace an explicit cart action',()=>{
    expect(buildCatalogDiscovery('Prepare the cart with vegetarian breakfast for two',{dietary:[]})).toBeNull();
  });
  test('parses concise numbered selections only',()=>{
    expect(parseOptionSelection('1')).toBe(1); expect(parseOptionSelection('Option 2')).toBe(2); expect(parseOptionSelection('Seçenek 3')).toBe(3);
    expect(parseOptionSelection('1 and pay')).toBeNull(); expect(parseOptionSelection('0')).toBeNull();
  });
  test('profile signatures do not depend on dietary order',()=>{
    expect(profileSignature({dietary:['vegan','gluten-free']})).toBe(profileSignature({dietary:['gluten-free','vegan']}));
  });
});
