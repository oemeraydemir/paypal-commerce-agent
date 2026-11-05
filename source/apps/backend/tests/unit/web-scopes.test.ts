import fs from 'fs';
import path from 'path';

// The Scoped AI Allowance management surface lives in the web storefront profile
// panel. The API is covered by tests/unit/allowance-scope.test.ts (service) and
// tests/integration/allowance-scope-persistence.test.ts (persistence). These
// tests cover the STOREFRONT surface: rendering, approve/revoke actions, create
// form, and i18n completeness for English and Turkish.

const pub = path.join(__dirname, '../../public');
const appJs = fs.readFileSync(path.join(pub, 'app.js'), 'utf8');
const i18nJs = fs.readFileSync(path.join(pub, 'i18n.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');

const enSection = i18nJs.slice(i18nJs.indexOf('en: {'), i18nJs.indexOf('tr: {'));
const trSection = i18nJs.slice(i18nJs.indexOf('tr: {'));

describe('storefront: scoped AI allowance', () => {
  test('the profile panel mounts a scopes container', () => {
    expect(indexHtml).toContain('id="scopes"');
    expect(indexHtml).toContain('scope.panelTitle');
    expect(indexHtml).toContain('scope.hint');
  });

  test('the storefront renders, approves, revokes and creates scopes', () => {
    expect(appJs).toContain('function renderScopes()');
    // List scopes for the owned session.
    expect(appJs).toContain("'/api/policy/scopes'");
    // Approve a pending agent-proposed scope.
    expect(appJs).toContain("'/approve'");
    // Revoke an active scope.
    expect(appJs).toContain("'/revoke'");
    // Create a shopper-scope with a daily limit.
    expect(appJs).toContain("'/api/policy/scopes'");
    expect(appJs).toContain('dailySpendLimitMinor');
    // The scopes surface is re-rendered on boot and profile render.
    expect(appJs).toContain('renderScopes();');
  });

  test('disable status mapping covers every backend status', () => {
    expect(appJs).toContain("s.status === 'ACTIVE'");
    expect(appJs).toContain("s.status === 'PENDING_APPROVAL'");
    expect(appJs).toContain("s.status === 'REVOKED'");
    expect(appJs).toContain("s.status === 'EXPIRED'");
    expect(appJs).toContain("s.status === 'SPENT'");
  });

  test('every scope.* key used by app.js exists in both languages', () => {
    const used = Array.from(new Set(appJs.match(/'scope\.[a-zA-Z.]+'/g) || []));
    expect(used.length).toBeGreaterThan(8);
    for (const quoted of used) {
      const key = quoted.slice(1, -1);
      expect(enSection).toContain(`'${key}'`);
      expect(trSection).toContain(`'${key}'`);
    }
  });

  test('the storefront stays CSP-safe', () => {
    expect(appJs).not.toMatch(/innerHTML|document\.write|eval\(/);
  });
});
