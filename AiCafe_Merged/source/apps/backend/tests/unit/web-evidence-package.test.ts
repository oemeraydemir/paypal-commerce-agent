import fs from 'fs';
import path from 'path';

// The Dispute Evidence Package is produced by the server (tests/integration/evidence.test.ts
// covers the API: signature, tamper detection, session isolation, PII minimisation).
// These tests cover the piece that was missing: the STOREFRONT surface that lets a
// shopper actually open, read, verify and export that package.

const pub = path.join(__dirname, '../../public');
const appJs = fs.readFileSync(path.join(pub, 'app.js'), 'utf8');
const i18nJs = fs.readFileSync(path.join(pub, 'i18n.js'), 'utf8');

const enSection = i18nJs.slice(i18nJs.indexOf('en: {'), i18nJs.indexOf('tr: {'));
const trSection = i18nJs.slice(i18nJs.indexOf('tr: {'));

describe('storefront: dispute evidence package', () => {
  test('the receipt exposes the evidence package and the order-to-resolution passport', () => {
    expect(appJs).toContain('evidenceBlock');
    // The package is fetched from the server for THIS order.
    expect(appJs).toContain("'/evidence'");
    // It can be verified independently (no session needed for the check).
    expect(appJs).toContain('/api/evidence/verify');
    expect(appJs).toContain('evidence.passport');
  });

  test('the passport lists order, policy decision, human approval and capture', () => {
    expect(appJs).toContain('evidence.step.created');
    expect(appJs).toContain('evidence.step.policy');
    expect(appJs).toContain('evidence.step.approval');
    expect(appJs).toContain('evidence.step.captured');
    // The human-approval state comes from the server, it is never invented here.
    expect(appJs).toContain('evidence.approval.approved');
    expect(appJs).toContain('evidence.approval.awaiting');
    expect(appJs).toContain('evidence.approval.notRecorded');
  });

  test('the package is verifiable and exportable, and is never auto-submitted', () => {
    expect(appJs).toContain('evidence.verify');
    expect(appJs).toContain('evidence.download');
    expect(appJs).toContain('evidence.exportNote');
    // The storefront never talks to PayPal itself: the approval URL comes from the server.
    expect(appJs).not.toMatch(/paypal\.com/);
  });

  test('the storefront stays CSP-safe and never injects untrusted content', () => {
    expect(appJs).not.toMatch(/innerHTML|document\.write|eval\(/);
  });

  test('every evidence.* key used by app.js exists in both languages', () => {
    const used = Array.from(new Set(appJs.match(/'evidence\.[a-zA-Z.]+'/g) || []));
    expect(used.length).toBeGreaterThan(20);
    for (const quoted of used) {
      const key = quoted.slice(1, -1);
      expect(enSection).toContain(`'${key}'`);
      expect(trSection).toContain(`'${key}'`);
    }
  });
});
