/* eslint-disable */
// Makes a BLOCKED smoke run impossible to mistake for a pass.
// - Always prints a loud banner listing every skipped smoke test.
// - With SMOKE_REQUIRE_REAL=1 (use this in CI / before submission) the run FAILS when anything was skipped.
class SmokeReporter {
  constructor(globalConfig) { this.globalConfig = globalConfig; this.failed = false; }
  onRunComplete(_contexts, results) {
    const skipped = [];
    for (const suite of results.testResults) {
      for (const t of suite.testResults) {
        if (t.status === 'pending' || t.status === 'skipped') skipped.push(`${suite.testFilePath.split(/tests[\\/]/).pop()} :: ${t.fullName}`);
      }
    }
    const line = '='.repeat(72);
    if (skipped.length) {
      console.log(`\n${line}\nSMOKE: ${skipped.length} test(s) BLOCKED — NOT VERIFIED (a skip is not a pass)\n${skipped.map((s) => '  - ' + s).join('\n')}\n` +
        'Reasons: DATABASE_URL not set (real PostgreSQL) and/or real PayPal sandbox credentials missing.\n' +
        'Run with SMOKE_REQUIRE_REAL=1 to make this a failure.\n' + line);
      if (process.env.SMOKE_REQUIRE_REAL === '1') this.failed = true;
    } else {
      console.log(`\n${line}\nSMOKE: all ${results.numPassedTests} real-integration test(s) executed.\n${line}`);
    }
  }
  getLastError() { if (this.failed) return new Error('SMOKE_REQUIRE_REAL=1: smoke tests were skipped (BLOCKED), failing the run.'); }
}
module.exports = SmokeReporter;
