/**
 * openapi.json is the input for the APIMatic / Postman SDK tooling, so it must stay internally consistent
 * and describe the AI Transaction Passport that /api/policy/preview really returns.
 */
import fs from 'fs';
import path from 'path';
import { buildTransactionPassport } from '../../src/passport/builder';

const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../../../openapi.json'), 'utf8'));

function resolve(ref: string): any {
  return ref.replace(/^#\//, '').split('/').reduce((o: any, k) => (o == null ? o : o[k]), spec);
}
function refs(node: any, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => refs(n, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref' && typeof v === 'string') out.push(v);
      else refs(v, out);
    }
  }
  return out;
}

describe('openapi.json contract', () => {
  it('every $ref resolves', () => {
    const missing = [...new Set(refs(spec))].filter((r) => resolve(r) === undefined);
    expect(missing).toEqual([]);
  });

  it('documents the passport on the policy preview response', () => {
    const preview = spec.components.schemas.PolicyPreviewResponse.properties.passport;
    expect(JSON.stringify(preview)).toContain('#/components/schemas/TransactionPassport');
  });

  it('TransactionPassport lists every property the server actually emits', () => {
    const p = buildTransactionPassport({
      items: [{ productId: 'a', name: 'A', quantity: 1, unitPriceMinor: 500, lineTotalMinor: 500 }],
      totalMinor: 500, currency: 'EUR', decision: 'AUTO_ALLOW', maxPerPurchaseMinor: 2000,
      confirmationThresholdMinor: 1000, dailyRemainingMinor: 10000, checks: [], hasWellbeingGuard: false,
    }) as any;
    const schema = spec.components.schemas.TransactionPassport.properties;
    for (const k of Object.keys(p)) expect(Object.keys(schema)).toContain(k);
    for (const k of Object.keys(p.mandate)) expect(Object.keys(schema.mandate.properties)).toContain(k);
    for (const k of Object.keys(p.control)) expect(Object.keys(schema.control.properties)).toContain(k);
  });
});
