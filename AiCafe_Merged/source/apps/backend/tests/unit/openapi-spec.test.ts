import { expect, test } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../../../openapi.json'), 'utf8'));

function* operations() {
  for (const [p, item] of Object.entries<any>(spec.paths)) {
    for (const [m, op] of Object.entries<any>(item)) if (op && op.responses) yield { p, m, op };
  }
}

test('every operation has a unique operationId (APIMatic derives SDK method names from them)', () => {
  const ids = [...operations()].map((o) => o.op.operationId);
  expect(ids.every((x) => typeof x === 'string' && x.length > 0)).toBe(true);
  expect(new Set(ids).size).toBe(ids.length);
});

test('every local $ref resolves', () => {
  const missing: string[] = [];
  const walk = (n: any) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n && typeof n === 'object') {
      for (const [k, v] of Object.entries<any>(n)) {
        if (k === '$ref' && typeof v === 'string' && v.startsWith('#/')) {
          const target = v.slice(2).split('/').reduce((a: any, s) => (a ? a[s] : undefined), spec);
          if (target === undefined) missing.push(v);
        } else walk(v);
      }
    }
  };
  walk(spec);
  expect(missing).toEqual([]);
});

test('documents the passport and take-home additions with their trust guarantees', () => {
  const s = spec.components.schemas;
  expect(s.PolicyPreviewResponse.properties.passport.$ref).toBe('#/components/schemas/TransactionPassport');
  expect(s.TransactionPassport.properties.control.properties.paymentAuthority.enum).toEqual([
    { value: 'shopper', description: 'Enum value shopper.' },
  ]);
  expect(s.TransactionPassport.properties.control.properties.agentCanPay.enum).toEqual([false]);
  expect(spec.paths['/api/discover/take-home'].post.operationId).toBe('postTakeHomeSuggestions');
});
