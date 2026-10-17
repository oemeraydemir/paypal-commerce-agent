#!/usr/bin/env node
/*
 * Captures real Chrome accessibility evidence for the dashboard grids.
 *
 * What it does (no mocks — a real Chrome instance against a real server):
 *   1. Opens /dashboard.html in Google Chrome via CDP.
 *   2. Reads the *browser accessibility tree* (`Accessibility.getFullAXTree`),
 *      which is the same tree the DevTools "Accessibility" pane renders.
 *   3. Counts role=grid / role=treegrid nodes and cross-checks them against the
 *      DOM (`[role=grid],[role=treegrid]`).
 *   4. Selects "Group by -> Origin" on the Orders grid, waits, and reads the
 *      tree again to show the role transition grid -> treegrid.
 *   5. Writes screenshots + JSON dumps into evidence/dashboard-grid-ax/.
 *
 * Run from the repo root with playwright-core resolvable, e.g.
 *   NODE_PATH=source/apps/backend/node_modules node evidence/scripts/dashboard-ax.cjs
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const BASE = process.env.DASHBOARD_URL || 'http://127.0.0.1:3000/dashboard.html';
const OUT = path.join(__dirname, '..', 'dashboard-grid-ax');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

fs.mkdirSync(OUT, { recursive: true });

/** Reduce the raw AX tree to the fields that matter for this check. */
function summarize(nodes) {
  const roles = {};
  const interesting = [];
  for (const n of nodes) {
    const role = n.role && n.role.value;
    if (!role) continue;
    roles[role] = (roles[role] || 0) + 1;
    if (role === 'grid' || role === 'treegrid' || role === 'region' || role === 'heading') {
      interesting.push({
        nodeId: n.nodeId,
        role,
        name: n.name ? n.name.value : '',
        ignored: !!n.ignored,
        level: n.properties && n.properties.find((p) => p.name === 'level')
          ? n.properties.find((p) => p.name === 'level').value.value
          : undefined,
      });
    }
  }
  return {
    counts: {
      grid: roles.grid || 0,
      treegrid: roles.treegrid || 0,
      row: roles.row || 0,
      columnheader: roles.columnheader || 0,
      gridcell: roles.gridcell || 0,
    },
    interesting,
  };
}

/** DOM-level cross-check + the per-section layout. */
async function domSnapshot(page) {
  return page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll('.grid-section')).map((s) => ({
      heading: (s.querySelector('h2') || {}).textContent || null,
      label: s.getAttribute('aria-label'),
      gridRootsInSection: s.querySelectorAll('[role="grid"],[role="treegrid"]').length,
      rootRole: (() => {
        const r = s.querySelector('.ag-root');
        return r ? r.getAttribute('role') : null;
      })(),
      rootLabelledBy: (() => {
        const r = s.querySelector('.ag-root');
        return r ? r.getAttribute('aria-labelledby') : null;
      })(),
      rows: s.querySelectorAll('.ag-row').length,
      groupRows: s.querySelectorAll('.ag-row-group').length,
      expandableRows: s.querySelectorAll('[aria-expanded]').length,
      ariaExpandedValues: Array.from(s.querySelectorAll('[aria-expanded]'))
        .slice(0, 5)
        .map((e) => e.getAttribute('aria-expanded')),
      status: (() => {
        const el = s.querySelector('.grid-status');
        return el ? el.textContent.trim() : null;
      })(),
      groupBy: (() => {
        const sel = s.querySelector('select');
        return sel ? { id: sel.id, value: sel.value } : null;
      })(),
    }));
    return {
      documentGridRoles: document.querySelectorAll('[role="grid"]').length,
      documentTreegridRoles: document.querySelectorAll('[role="treegrid"]').length,
      sections,
    };
  });
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--force-renderer-accessibility'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Accessibility.enable');

  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  // AG Grid renders asynchronously; give it a moment to settle.
  await page.waitForSelector('.ag-root', { timeout: 30000 });
  await page.waitForTimeout(2500);

  const beforeTree = summarize((await cdp.send('Accessibility.getFullAXTree')).nodes);
  const beforeDom = await domSnapshot(page);
  fs.writeFileSync(path.join(OUT, 'ax-tree-before.json'), JSON.stringify(beforeTree, null, 2));
  fs.writeFileSync(path.join(OUT, 'dom-before.json'), JSON.stringify(beforeDom, null, 2));
  await page.screenshot({ path: path.join(OUT, '01-before-groupby.png'), fullPage: true });

  // ---- switch BOTH grids to a grouped view ------------------------------
  // Orders is empty in this environment (no PayPal credentials -> no orders can
  // be created), Policy events has real rows from the MCP prepare_cart run.
  // Grouping both isolates "empty data" from "grouping" as the cause of the role.
  await page.selectOption('#ordersGroupBy', 'origin');
  await page.selectOption('#eventsGroupBy', 'decision');
  await page.waitForTimeout(3000);

  const afterTree = summarize((await cdp.send('Accessibility.getFullAXTree')).nodes);
  const afterDom = await domSnapshot(page);
  fs.writeFileSync(path.join(OUT, 'ax-tree-after.json'), JSON.stringify(afterTree, null, 2));
  fs.writeFileSync(path.join(OUT, 'dom-after.json'), JSON.stringify(afterDom, null, 2));
  await page.screenshot({ path: path.join(OUT, '02-after-groupby.png'), fullPage: true });

  // Close-up of the populated, grouped grid — this is the one the AX tree below
  // describes (Orders is empty here: no PayPal credentials, so no orders exist).
  const eventsSection = await page.$('#eventsGrid');
  if (eventsSection) {
    await eventsSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await eventsSection.screenshot({ path: path.join(OUT, '02b-events-grid-grouped.png') });
  }

  // Accessibility tree of the *grouped, populated* events grid only.
  await cdp.send('DOM.enable');
  const { root: docRoot } = await cdp.send('DOM.getDocument');
  const { nodeId: eventsNodeId } = await cdp.send('DOM.querySelector', {
    nodeId: docRoot.nodeId,
    selector: '#eventsGrid .ag-root',
  });
  if (eventsNodeId) {
    const partial = await cdp.send('Accessibility.getPartialAXTree', {
      nodeId: eventsNodeId,
      fetchRelatives: true,
    });
    fs.writeFileSync(
      path.join(OUT, 'ax-events-grouped-subtree.json'),
      JSON.stringify(
        partial.nodes.map((n) => ({
          role: n.role && n.role.value,
          name: n.name && n.name.value,
          level: n.properties && n.properties.find((p) => p.name === 'level')?.value.value,
          expanded: n.properties && n.properties.find((p) => p.name === 'expanded')?.value.value,
        })),
        null,
        2
      )
    );
  }

  // Focused-element proof: the select is keyboard reachable and visibly focused.
  await page.focus('#ordersGroupBy');
  await page.screenshot({ path: path.join(OUT, '03-groupby-focused.png'), fullPage: false });

  const report = {
    url: BASE,
    chrome: await browser.version(),
    before: { counts: beforeTree.counts, dom: beforeDom },
    after: { counts: afterTree.counts, dom: afterDom },
    consoleErrors: errors,
  };
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})().catch((err) => {
  console.error('FAILED:', err && err.message ? err.message : err);
  process.exit(1);
});
