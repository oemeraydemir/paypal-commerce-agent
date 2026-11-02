/*
 * Agent activity (Control Center).
 *
 * Read-only view over data the server already records: GET /api/policy-events and
 * GET /api/policy-events/stats. It answers three questions a merchant or judge asks:
 *   1. What did the agent do?        -> decisions the policy engine made on the agent's carts
 *   2. What did the policy block?    -> BLOCK decisions, grouped by rule, incl. Wellbeing Guard rules
 *   3. Where did the money go?       -> only orders that reached PAID (server-computed)
 * It never calls a write endpoint and never decides anything itself.
 */
(function (root) {
  'use strict';

  var GUARD_PREFIX = 'shopperGuard.';
  var KEY_STORE = 'aicafe.opsKey';

  // Pure function: events (newest first or any order) + stats -> display model.
  function summarize(events, stats) {
    events = Array.isArray(events) ? events : [];
    var counts = { AUTO_ALLOW: 0, REQUIRE_CONFIRMATION: 0, BLOCK: 0 };
    var byRule = {};
    var guard = [];
    var versions = {};
    events.forEach(function (e) {
      if (counts[e.decision] !== undefined) counts[e.decision] += 1;
      var rules = Array.isArray(e.violatedRules) ? e.violatedRules : [];
      rules.forEach(function (r) {
        var name = r && (r.rule || r.name || r.id) ? String(r.rule || r.name || r.id) : String(r);
        if (e.decision === 'BLOCK') byRule[name] = (byRule[name] || 0) + 1;
        if (name.indexOf(GUARD_PREFIX) === 0) guard.push({ event: e, rule: name });
      });
      if (e.guardDataVersion) versions[e.guardDataVersion] = true;
    });
    var topRules = Object.keys(byRule)
      .map(function (k) { return { rule: k, count: byRule[k] }; })
      .sort(function (a, b) { return b.count - a.count || (a.rule < b.rule ? -1 : 1); });
    return {
      total: events.length,
      counts: counts,
      topRules: topRules,
      guardDecisions: guard,
      guardDataVersions: Object.keys(versions),
      spentFormatted: stats && stats.spentFormatted ? String(stats.spentFormatted) : null,
      statsTotals: stats ? { allowed: stats.allowed, blocked: stats.blocked, total: stats.totalRequests } : null,
    };
  }

  function friendlyRule(rule) {
    var map = {
      'shopperGuard.allergens': 'Allergen guard',
      'shopperGuard.diet': 'Diet guard',
      requiredDietaryAttributes: 'Required dietary attribute',
      blockedDietaryAttributes: 'Blocked dietary attribute',
    };
    return map[rule] || rule;
  }

  var api = { summarize: summarize, friendlyRule: friendlyRule };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AgentActivity = api;

  var mount = typeof document !== 'undefined' ? document.getElementById('agentActivity') : null;
  if (!mount) return;

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function headers() {
    try { var k = sessionStorage.getItem(KEY_STORE); return k ? { 'X-Ops-Key': k } : {}; } catch (e) { return {}; }
  }
  function getJson(path) {
    return fetch(path, { headers: headers() }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, status: r.status, body: b }; });
    });
  }

  function card(title, big, lines) {
    var c = el('div', 'aa-card');
    c.appendChild(el('h3', 'aa-q', title));
    c.appendChild(el('p', 'aa-big', big));
    lines.forEach(function (l) { c.appendChild(el('p', 'ops-muted', l)); });
    return c;
  }

  function render(model) {
    mount.textContent = '';
    var head = el('div', 'ops-head');
    head.appendChild(el('h2', '', 'Agent activity'));
    var refresh = el('button', 'ops-chip', 'Refresh'); refresh.type = 'button'; refresh.onclick = load;
    head.appendChild(refresh);
    mount.appendChild(head);
    mount.appendChild(el('p', 'ops-muted', 'Read-only. Everything here is recorded by the server; the agent decides nothing and holds no payment authority.'));

    var c = model.counts;
    var grid = el('div', 'aa-grid');
    grid.appendChild(card('What did the agent do?', String(model.total) + ' checked carts', [
      c.AUTO_ALLOW + ' within limits', c.REQUIRE_CONFIRMATION + ' needed the shopper\u2019s approval on PayPal',
    ]));
    var blockLines = model.topRules.slice(0, 3).map(function (r) { return friendlyRule(r.rule) + ': ' + r.count; });
    if (!blockLines.length) blockLines = ['No rule has blocked a cart yet.'];
    grid.appendChild(card('What did the policy block?', String(c.BLOCK) + ' blocked', blockLines));
    grid.appendChild(card('Where did the money go?', model.spentFormatted || 'n/a', [
      'Counts only orders that reached PAID.', 'Capture is confirmed by PayPal, not by the agent.',
    ]));
    mount.appendChild(grid);

    mount.appendChild(el('h3', 'aa-sub', 'Wellbeing Guard decisions'));
    if (!model.guardDecisions.length) {
      mount.appendChild(el('p', 'ops-muted', 'No Guard decisions recorded yet. They appear when a shopper with a diet or allergen guard checks out.'));
    } else {
      var ul = el('ul', 'refund-list');
      model.guardDecisions.slice(0, 10).forEach(function (g) {
        var li = el('li', 'refund-item');
        li.appendChild(el('strong', '', friendlyRule(g.rule) + ' \u2192 ' + g.event.decision.replace(/_/g, ' ').toLowerCase()));
        if (g.event.reason) li.appendChild(el('div', 'ops-muted', g.event.reason));
        li.appendChild(el('div', 'ops-muted', new Date(g.event.timestamp).toLocaleString() + (g.event.guardDataVersion ? ' \u00b7 menu data ' + g.event.guardDataVersion : '')));
        ul.appendChild(li);
      });
      mount.appendChild(ul);
      mount.appendChild(el('p', 'ops-muted', 'Allergen data is declared by the caf\u00e9 and unverified. Not medical advice.'));
    }
  }

  function load() {
    Promise.all([getJson('/api/policy-events?limit=100'), getJson('/api/policy-events/stats')]).then(function (res) {
      if (!res[0].ok) {
        mount.textContent = '';
        mount.appendChild(el('p', 'ops-muted', res[0].status === 401 || res[0].status === 403
          ? 'Enter the merchant key in the panel above to see agent activity.'
          : 'Agent activity is unavailable right now.'));
        return;
      }
      render(summarize(res[0].body.events, res[1].ok ? res[1].body : null));
    }).catch(function () {
      mount.textContent = '';
      mount.appendChild(el('p', 'ops-muted', 'Could not reach the server.'));
    });
  }
  load();
})(typeof window !== 'undefined' ? window : globalThis);
