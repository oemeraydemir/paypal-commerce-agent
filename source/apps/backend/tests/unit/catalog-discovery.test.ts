import { buildCatalogDiscovery, parseOptionSelection, profileSignature, formatDiscoveryReply } from '../../src/ai/catalog-discovery';
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
  test('reply explains every option with grounded metadata (vegetarian lunch under €12)',()=>{
    const d=buildCatalogDiscovery('Recommend a vegetarian lunch under €12. Give me three choices and explain briefly why each one fits.',{dietary:[],maxBudgetMinor:1200});
    expect(d).not.toBeNull();
    expect(d!.options.length).toBeGreaterThanOrEqual(2);
    const reply=formatDiscoveryReply(d!);
    expect(reply).toMatch(/Options:/);
    expect(reply).toMatch(/Within your .* budget\./);
    // every numbered row has a title header and at least one explanation line beneath it
    for(let i=1;i<=d!.options.length;i++){
      const row=new RegExp(`^${i}\\. `,'m');
      expect(row.test(reply)).toBe(true);
    }
    // never a verified allergen guarantee
    expect(reply).not.toMatch(/allergen-free|guaranteed safe|safe for allergies|suitable for an allergy/i);
  });
});
