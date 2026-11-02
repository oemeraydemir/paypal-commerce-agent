import fs from 'fs';
import path from 'path';

const pub = path.join(__dirname, '../../public');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { summarize, friendlyRule } = require(path.join(pub, 'agent-activity.js'));

const ev = (decision: string, rules: any[] = [], extra: any = {}) => ({
  id: Math.random().toString(36), timestamp: '2026-11-01T10:00:00.000Z', decision, violatedRules: rules, reason: 'r', ...extra,
});

describe('Control Center: agent activity summary', () => {
  test('counts decisions and blocked rules', () => {
    const m = summarize(
      [ev('AUTO_ALLOW'), ev('REQUIRE_CONFIRMATION'), ev('BLOCK', [{ rule: 'maxOrderTotal' }]), ev('BLOCK', [{ rule: 'maxOrderTotal' }, { rule: 'shopperGuard.allergens' }])],
      { spentFormatted: '€18,00' },
    );
    expect(m.total).toBe(4);
    expect(m.counts).toEqual({ AUTO_ALLOW: 1, REQUIRE_CONFIRMATION: 1, BLOCK: 2 });
    expect(m.topRules[0]).toEqual({ rule: 'maxOrderTotal', count: 2 });
    expect(m.spentFormatted).toBe('€18,00');
  });

  test('separates Wellbeing Guard decisions and records the menu-data version', () => {
    const m = summarize([ev('BLOCK', [{ rule: 'shopperGuard.allergens' }], { guardDataVersion: 'abc123' }), ev('AUTO_ALLOW')], null);
    expect(m.guardDecisions).toHaveLength(1);
    expect(m.guardDataVersions).toEqual(['abc123']);
    expect(m.spentFormatted).toBeNull();
  });

  test('tolerates empty and malformed input without throwing', () => {
    expect(summarize(undefined, undefined).total).toBe(0);
    expect(() => summarize([{ decision: 'BLOCK', violatedRules: 'x' }], {})).not.toThrow();
  });

  test('friendly names fall back to the raw rule id', () => {
    expect(friendlyRule('shopperGuard.diet')).toBe('Diet guard');
    expect(friendlyRule('someNewRule')).toBe('someNewRule');
  });

  test('the panel is read-only: it issues no write request', () => {
    const src = fs.readFileSync(path.join(pub, 'agent-activity.js'), 'utf8');
    expect(src).not.toMatch(/method:\s*['"](POST|PUT|PATCH|DELETE)/i);
    expect(fs.readFileSync(path.join(pub, 'dashboard.html'), 'utf8')).toContain('/agent-activity.js');
  });
});
