#!/usr/bin/env node
/* Self-test for tools/make-submission-zip.js. Uses ONLY invented data in a throw-away temp project
 * (via --root); never reads or prints a real secret.   node tools/make-submission-zip.selftest.js */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const BUILDER = path.join(__dirname, 'make-submission-zip.js');
// Values are assembled at run time so this file itself contains no key-shaped literal.
const fakeOpenAi = 'sk-' + 'Zq8Lm2'.repeat(6);
const fakeGroq = 'gsk_' + 'Rt5Xw9'.repeat(5);
const fakeDbUrl = 'postgres://' + 'app' + ':' + 'Pw7' + 'Kd29xQ' + '@db.internal.example-cloud.net:5432/prod';

let failed = 0;
const results = [];
function project(extra) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aicafe-selftest-'));
  const w = (rel, text) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
  w('README.md', '# Demo\n'); w('LICENSE', 'MIT\n'); w('.gitignore', '.env\n');
  w('docs/GUIDE.md', 'Plain documentation.\n');
  w('source/apps/backend/.env.example', 'OPENAI_API_KEY=your-key-here\n');
  w('source/apps/backend/src/app.ts', 'export const x = 1;\n');
  extra(w);
  return dir;
}
function run(dir) {
  const out = path.join(dir, 'out.zip');
  const r = spawnSync(process.execPath, [BUILDER, '--root', dir, '--out', out], { encoding: 'utf8' });
  const names = fs.existsSync(out) && process.platform !== 'win32'
    ? spawnSync('unzip', ['-Z1', out], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean) : [];
  return { code: r.status, text: (r.stdout || '') + (r.stderr || ''), names, out };
}
function check(name, ok, detail) { results.push([ok, name]); if (!ok) { failed++; console.log(`  FAIL ${name}${detail ? ' :: ' + detail : ''}`); } else console.log(`  ok   ${name}`); }

console.log('1. clean project builds and the archive is re-verified');
{ const r = run(project(() => {}));
  check('exit 0', r.code === 0, r.text.slice(-200));
  check('verification line printed', /re-opened and verified/.test(r.text));
  check('.env.example is kept', r.names.some((n) => n.endsWith('.env.example'))); }

console.log('2. every kind of real env/credential file stays out (their content is fake)');
{ const r = run(project((w) => {
    for (const f of ['.env', '.env.local', '.env.production', 'prod.env', '.envrc', 'env.local', 'secrets.json', 'credentials.json', 'service-account.json'])
      w('source/apps/backend/' + f, 'OPENAI_API_KEY=' + fakeOpenAi + '\n');
    w('docs/.env', 'X=1\n'); w('docs/staging.env', 'X=1\n');
  }));
  check('exit 0 (files excluded, not fatal)', r.code === 0, r.text.slice(-200));
  const leaked = r.names.filter((n) => /(^|\/)(\.env(\.local|\.production)?|[^/]*\.env|\.envrc|env\.local|secrets\.json|credentials\.json|service-account\.json)$/.test(n));
  check('no env/credential name in archive', leaked.length === 0, leaked.join(','));
  check('.env.example still present', r.names.some((n) => n.endsWith('.env.example'))); }

console.log('3. key-shaped values are caught in docs and code');
{ for (const [label, rel, body] of [
    ['OpenAI-style key in docs', 'docs/GUIDE.md', 'key: ' + fakeOpenAi + '\n'],
    ['Groq-style key in source', 'source/apps/backend/src/app.ts', 'const k = "' + fakeGroq + '";\n'],
    ['DB URL with password in docs', 'docs/GUIDE.md', fakeDbUrl + '\n'],
    ['key next to the word "test"', 'docs/GUIDE.md', 'OPENAI_API_KEY=' + fakeOpenAi + ' # test\n'],
  ]) { const r = run(project((w) => w(rel, body)));
       check(label + ' -> exit 2', r.code === 2, 'exit ' + r.code);
       check(label + ' -> value not printed', !r.text.includes(fakeOpenAi) && !r.text.includes(fakeGroq) && !r.text.includes('Kd29xQ')); } }

console.log('4. tests/ folders are scanned too');
{ let r = run(project((w) => w('source/apps/backend/tests/unit/leak.test.ts', 'const k = "' + fakeOpenAi + '";\n')));
  check('real-looking key inside tests/ -> exit 2', r.code === 2, 'exit ' + r.code);
  r = run(project((w) => w('source/apps/backend/tests/unit/redact.test.ts', 'const k = "sk-proj-abcDEF1234567890xyz";\n')));
  check('marked fake fixture inside tests/ -> accepted', r.code === 0, r.text.slice(-200)); }

console.log('5. value cross-check: a real env value hidden where no pattern can see it');
{ // The planted value matches NO key pattern, so only the env-value fingerprint can find it.
  const hidden = 'Qw7' + 'Zp3Rt9Lm4Xc8Vb2';
  const mk = (w) => { w('source/apps/backend/.env', 'APP_SECRET_TOKEN=' + hidden + '\n'); w('docs/GUIDE.md', 'Notes: ' + hidden + '\n'); };
  let r = run(project(mk));
  check('pre-build cross-check -> exit 2', r.code === 2, 'exit ' + r.code);
  check('names only, value never printed', /APP_SECRET_TOKEN/.test(r.text) && !r.text.includes(hidden));
  const before = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('aicafe-zipcheck-')).length;
  const dir = project(mk);
  const out = path.join(dir, 'out.zip');
  const rr = spawnSync(process.execPath, [BUILDER, '--root', dir, '--out', out, '--selftest-skip-prescan'], { encoding: 'utf8', env: { ...process.env, AICAFE_SELFTEST: '1' } });
  const text = (rr.stdout || '') + (rr.stderr || '');
  check('archive check alone catches it -> exit 4', rr.status === 4, 'exit ' + rr.status);
  check('failed archive is deleted', !fs.existsSync(out));
  check('staging folder removed', !fs.existsSync(path.join(dir, '_submission-stage')));
  check('verification temp dir removed', fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('aicafe-zipcheck-')).length === before);
  check('archive failure names file + variable, not the value', /AiCafe\/docs\/GUIDE\.md/.test(text) && /APP_SECRET_TOKEN/.test(text) && !text.includes(hidden));
  const noHook = spawnSync(process.execPath, [BUILDER, '--root', dir, '--out', out, '--selftest-skip-prescan'], { encoding: 'utf8' });
  check('hook is inert without AICAFE_SELFTEST=1', noHook.status === 2, 'exit ' + noHook.status); }

console.log('6. nothing is skipped silently');
{ let r = run(project((w) => w('source/apps/flutter_app/android/app/blob.bin', Buffer.from([0, 1, 2, 3]).toString('latin1'))));
  check('unknown binary type -> exit 2', r.code === 2, 'exit ' + r.code);
  r = run(project((w) => { w('source/apps/flutter_app/web/icon.png', Buffer.from([0x89, 0x50, 0, 1]).toString('latin1')); }));
  check('known image type accepted (exit 0)', r.code === 0, r.text.slice(-200));
  r = run(project((w) => { w('source/apps/flutter_app/ios/Flutter/Generated.xcconfig', 'FLUTTER_ROOT=C:\\src\\flutter\n');
        w('source/apps/flutter_app/ios/Flutter/flutter_export_environment.sh', 'export x\n');
        w('source/apps/flutter_app/android/gradle/wrapper/gradle-wrapper.jar', 'PK\u0000\u0001');
        w('source/apps/flutter_app/android/app/src/main/java/io/flutter/plugins/GeneratedPluginRegistrant.java', 'x\n'); }));
  check('generated / per-machine files excluded', r.code === 0 && !r.names.some((n) => /Generated\.xcconfig|flutter_export_environment|gradle-wrapper\.jar|GeneratedPluginRegistrant/.test(n)), r.names.join(','));
  if (process.platform !== 'win32') {
    r = run(project((w) => w('docs/real.md', 'hello\n')));
    const dir = project(() => {});
    fs.symlinkSync(path.join(dir, 'README.md'), path.join(dir, 'docs-link.md'));
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
    fs.symlinkSync(path.join(dir, 'README.md'), path.join(dir, 'docs', 'linked.md'));
    const sr = spawnSync(process.execPath, [BUILDER, '--root', dir, '--out', path.join(dir, 'o.zip')], { encoding: 'utf8' });
    check('symlink is reported and not followed', /Symlinks left out/.test(sr.stdout) && sr.status === 0, sr.stdout.slice(-200)); } }

console.log('7. superseded / merged documents are left out of the package (files stay on disk)');
{ const r = run(project((w) => {
    w('docs/JURY_REVIEW.md', 'x\n'); w('docs/VERIFICATION_PROMPTS.md', 'x\n');
    w('source/apps/backend/ARCHITECTURE.md', 'x\n'); w('source/apps/backend/DEPLOYMENT.md', 'x\n');
    w('source/apps/backend/ENVIRONMENT.md', 'x\n'); w('source/apps/backend/render.yaml', 'x\n');
    w('ARCHITECTURE.md', 'root\n'); w('render.yaml', 'root\n'); w('docs/JUDGING.md', 'j\n'); }));
  check('exit 0', r.code === 0, r.text.slice(-200));
  const left = r.names.filter((n) => /JURY_REVIEW|VERIFICATION_PROMPTS|backend\/(ARCHITECTURE|DEPLOYMENT|ENVIRONMENT)\.md|backend\/render\.yaml/.test(n));
  check('excluded paths absent', left.length === 0, left.join(','));
  check('root copies and JUDGING kept', ['ARCHITECTURE.md', 'render.yaml', 'docs/JUDGING.md'].every((f) => r.names.includes('AiCafe/' + f))); }

console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
