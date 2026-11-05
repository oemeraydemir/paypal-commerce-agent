// Agent Control Center — operational status panels.
// Fetches /api/dashboard/summary and renders:
//   - AI agent operations (order counts by origin, AI policy events)
//   - Policy decisions (allowed vs blocked vs confirmation)
//   - Money movement (captured, refunded, net, pending refund)
//   - Spending Mandate summary
//   - Split Bill status
//   - Dispute cases (with evidence export link)
//   - Wellbeing decisions
//   - Refund queue summary
//
// All rendering is textContent-only (no innerHTML). Empty/loading/error
// states are shown honestly; no fabricated metrics.
(function () {
  'use strict';

  var root = document.getElementById('acsPanels');
  if (!root) return;

  var evidenceRoot = document.getElementById('evidenceExport');
  var evidenceList = document.getElementById('evidenceList');
  var evidenceStatus = document.getElementById('evidenceStatus');

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function opsHeaders() {
    try {
      var k = sessionStorage.getItem('aicafe.opsKey');
      return k ? { 'X-Ops-Key': k } : {};
    } catch (e) {
      return {};
    }
  }

  function money(minor, currency) {
    var cur = currency || 'EUR';
    if (typeof minor !== 'number') return '—';
    try {
      return (minor / 100).toLocaleString(undefined, {
        style: 'currency', currency: cur,
        minimumFractionDigits: 2, maximumFractionDigits: 2
      });
    } catch (e) {
      return (minor / 100).toFixed(2) + ' ' + cur;
    }
  }

  function setNode(id, text) {
    var n = document.getElementById(id);
    if (n) n.textContent = text;
  }

  function clearNode(id) {
    var n = document.getElementById(id);
    if (n) n.textContent = '';
  }

  // Render a list of key-value pairs inside a container.
  function renderKvList(container, items) {
    container.textContent = '';
    if (!items.length) {
      container.appendChild(el('p', 'ops-muted', 'No data to display yet.'));
      return;
    }
    var grid = el('div', 'stats');
    grid.style.marginBottom = '0';
    items.forEach(function (item) {
      var card = el('div', 'stat-card');
      card.style.minHeight = 'auto';
      card.style.padding = '10px 12px';
      card.appendChild(el('div', 'stat-label', item.label));
      var v = el('p', 'stat-value');
      v.style.fontSize = '1.2rem';
      v.textContent = item.value;
      card.appendChild(v);
      if (item.sub) card.appendChild(el('div', 'stat-sub', item.sub));
      grid.appendChild(card);
    });
    container.appendChild(grid);
  }

  // Render a table-like list of objects.
  function renderRows(container, rows, columns) {
    container.textContent = '';
    if (!rows.length) {
      container.appendChild(el('p', 'ops-muted', 'No records to display yet.'));
      return;
    }
    var grid = el('div', 'stats');
    grid.style.marginBottom = '0';
    rows.slice(0, 20).forEach(function (row) {
      var card = el('div', 'stat-card');
      card.style.minHeight = 'auto';
      card.style.padding = '10px 12px';
      columns.forEach(function (col) {
        var val = row[col.field];
        if (col.format) val = col.format(val, row);
        card.appendChild(el('div', 'stat-label', col.label));
        var v = el('p', 'stat-value');
        v.style.fontSize = '1rem';
        v.textContent = String(val != null ? val : '—');
        card.appendChild(v);
      });
      grid.appendChild(card);
    });
    container.appendChild(grid);
  }

  function renderSummary(data) {
    if (!data) {
      setNode('acsMuted', 'No data returned from the backend.');
      setNode('acsBadge', 'empty');
      return;
    }
    setNode('acsBadge', 'updated ' + new Date(data.generatedAt || Date.now()).toLocaleTimeString());
    setNode('acsMuted', '');

    // ---- KPI strip ----
    var orders = data.orders || {};
    setNode('acsAiAgentOrders', String((orders.aiAgent || 0) + (orders.aiAssisted || 0)));
    setNode('acsAiAgentSub', (orders.aiAgent || 0) + ' AI agent · ' + (orders.aiAssisted || 0) + ' AI assisted · ' + (orders.human || 0) + ' human');

    var policy = data.policy || {};
    setNode('acsPolicyDecisions', String(policy.totalEvents || 0));
    setNode('acsPolicySub', (policy.allowed || 0) + ' allowed · ' + (policy.blocked || 0) + ' blocked · ' + (policy.requireConfirmation || 0) + ' confirmation');

    var revenue = data.revenue || {};
    setNode('acsMoneyMoved', revenue.netFormatted || money(revenue.netMinor, revenue.currency));
    setNode('acsMoneySub', (revenue.capturedFormatted || '—') + ' captured · ' + (revenue.refundedFormatted || '—') + ' refunded');

    // ---- Spending Mandate ----
    var mandate = data.mandate || {};
    var mandateContainer = document.getElementById('acsMandate');
    if (mandate.note && !mandate.maxPerPurchaseMinor) {
      renderKvList(mandateContainer, [{ label: 'Status', value: mandate.note }]);
    } else {
      renderKvList(mandateContainer, [
        { label: 'Template: max per purchase', value: money(mandate.maxPerPurchaseMinor, mandate.currency || 'EUR') },
        { label: 'Template: daily limit', value: money(mandate.dailySpendLimitMinor, mandate.currency || 'EUR') },
        { label: 'Template: confirm above', value: money(mandate.confirmationThresholdMinor, mandate.currency || 'EUR') },
        { label: 'Active sessions', value: String(mandate.activeSessions != null ? mandate.activeSessions : '—'), sub: (mandate.customizedPolicies || 0) + ' with customised limits' },
      ]);
      if (mandate.source === 'default-session-template') {
        mandateContainer.appendChild(el('p', 'ops-muted', 'Every session has its own policy, enforced server-side at checkout. These are the limits new sessions start from.'));
      }
    }

    // ---- Agent timeline ----
    renderTimeline(data.timeline || [], !!data.redactedDetail);

    // ---- Split Bills ----
    var bills = data.splitBills || {};
    var billsContainer = document.getElementById('acsBills');
    var billKvs = [
      { label: 'Total bills', value: String(bills.total || 0), sub: (bills.open || 0) + ' open · ' + (bills.settled || 0) + ' settled · ' + (bills.cancelled || 0) + ' cancelled' },
    ];
    if (bills.groups && bills.groups.length) {
      renderRows(billsContainer, bills.groups, [
        { field: 'id', label: 'Bill ID' },
        { field: 'status', label: 'Status' },
        { field: 'totalFormatted', label: 'Total' },
        { field: 'paidShares', label: 'Paid shares', format: function (v, r) { return v + ' / ' + r.participantCount; } },
      ]);
    } else {
      renderKvList(billsContainer, billKvs);
    }

    // ---- Disputes ----
    var disputes = data.disputes || {};
    var dispContainer = document.getElementById('acsDisputes');
    var redacted = !!data.redactedDetail;
    if (disputes.cases && disputes.cases.length) {
      renderRows(dispContainer, disputes.cases, [
        { field: 'id', label: 'Case ID' },
        { field: 'orderId', label: 'Order ID' },
        { field: 'status', label: 'Status' },
        { field: 'lifecycleStage', label: 'Stage' },
        { field: 'sellerResponseDueAt', label: 'Due', format: function (v) { return v || '—'; } },
      ]);
    } else if (redacted) {
      renderKvList(dispContainer, [
        { label: 'Dispute cases', value: String(disputes.total || 0), sub: 'Detail is merchant-only. Enter the merchant key (refund queue) to view cases.' },
      ]);
    } else {
      renderKvList(dispContainer, [
        { label: 'Total disputes', value: String(disputes.total || 0), sub: disputes.total ? '' : 'No dispute cases recorded.' },
      ]);
    }

    // ---- Wellbeing ----
    var wellbeing = data.wellbeing || {};
    var wbContainer = document.getElementById('acsWellbeing');
    if (wellbeing.decisions && wellbeing.decisions.length) {
      renderRows(wbContainer, wellbeing.decisions, [
        { field: 'wellbeingStatus', label: 'Status' },
        { field: 'decision', label: 'Policy' },
        { field: 'itemCount', label: 'Items' },
        { field: 'timestamp', label: 'Time', format: function (v) { return v ? new Date(v).toLocaleString() : '—'; } },
      ]);
    } else if (redacted) {
      renderKvList(wbContainer, [
        { label: 'Wellbeing events', value: String(wellbeing.totalEvents || 0), sub: 'Detail is merchant-only. Enter the merchant key (refund queue) to view decisions.' },
      ]);
    } else {
      renderKvList(wbContainer, [
        { label: 'Wellbeing events', value: String(wellbeing.totalEvents || 0), sub: 'No wellbeing decisions recorded yet.' },
      ]);
    }

    // ---- Refund queue summary ----
    var refunds = data.refunds || {};
    var refContainer = document.getElementById('acsRefunds');
    if (refunds.records && refunds.records.length) {
      renderRows(refContainer, refunds.records, [
        { field: 'amountFormatted', label: 'Amount' },
        { field: 'status', label: 'Status' },
        { field: 'proposedBy', label: 'Proposed by' },
        { field: 'reason', label: 'Reason' },
      ]);
    } else if (redacted) {
      renderKvList(refContainer, [
        { label: 'Total refunds', value: String(refunds.total || 0), sub: 'Detail is merchant-only. Enter the merchant key (refund queue) to view requests.' },
      ]);
    } else {
      renderKvList(refContainer, [
        { label: 'Total refunds', value: String(refunds.total || 0), sub: (refunds.proposed || 0) + ' proposed · ' + (refunds.refunded || 0) + ' refunded · ' + (refunds.rejected || 0) + ' rejected' },
      ]);
    }

    // ---- Evidence export (from disputes) ----
    renderEvidenceExport(disputes, redacted);
  }

  var ACTOR_LABEL = { 'ai-agent': 'AI agent', 'ai-assisted': 'AI assisted', human: 'Human', server: 'Server rule', merchant: 'Merchant', customer: 'Customer', ops_copilot: 'Ops Copilot' };

  function renderTimeline(entries, redacted) {
    var box = document.getElementById('acsTimeline');
    if (!box) return;
    box.textContent = '';
    if (!entries.length) {
      box.appendChild(el('p', 'ops-muted', 'No agent activity yet. Run a chat or checkout and it appears here.'));
      return;
    }
    var list = el('ul', 'refund-list');
    list.setAttribute('aria-label', 'Agent activity, newest first');
    entries.slice(0, 15).forEach(function (e) {
      var li = el('li', 'refund-item');
      var head = el('div', 'refund-line');
      head.appendChild(el('strong', '', e.label || e.kind));
      if (e.amountFormatted) head.appendChild(el('span', 'refund-state', e.amountFormatted));
      head.appendChild(el('span', 'ops-muted', (ACTOR_LABEL[e.actor] || e.actor || '—') + ' · ' + (e.at ? new Date(e.at).toLocaleString() : '—')));
      li.appendChild(head);
      if (e.ref) li.appendChild(el('div', 'ops-muted', e.ref));
      list.appendChild(li);
    });
    box.appendChild(list);
    if (redacted) box.appendChild(el('p', 'ops-muted', 'Public view: references and reasons are merchant-only.'));
  }

  function renderEvidenceExport(disputes, redacted) {
    if (!evidenceList || !evidenceStatus) return;
    evidenceList.textContent = '';
    var cases = disputes.cases || [];
    if (redacted) {
      evidenceStatus.textContent = 'Evidence export is merchant-only. Enter the merchant key in the refund queue above to load dispute cases.';
      return;
    }
    if (!cases.length) {
      evidenceStatus.textContent = 'No dispute cases to export.';
      return;
    }
    evidenceStatus.textContent = cases.length + ' dispute case(s) available for evidence export.';
    cases.forEach(function (c) {
      var li = el('li', 'refund-item');
      var head = el('div', 'refund-line');
      head.appendChild(el('strong', '', 'Case ' + (c.id || '').slice(0, 12) + '…'));
      head.appendChild(el('span', 'refund-state', c.status || '—'));
      head.appendChild(el('span', 'ops-muted', 'order ' + (c.orderId || '—').slice(0, 8) + '…'));
      li.appendChild(head);
      li.appendChild(el('div', 'ops-muted', 'Stage: ' + (c.lifecycleStage || '—') + (c.sellerResponseDueAt ? ' · due ' + c.sellerResponseDueAt : '')));

      var btn = el('button', 'ops-chip', 'Export redacted evidence');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Export redacted evidence for dispute case ' + c.id);
      var out = el('pre', 'ops-muted');
      out.hidden = true;
      out.style.cssText = 'white-space:pre-wrap;max-height:280px;overflow:auto;margin:8px 0';
      btn.onclick = function () {
        if (!out.hidden) { out.hidden = true; return; }
        btn.disabled = true;
        btn.textContent = 'Loading…';
        var headers = opsHeaders();
        fetch('/api/disputes/' + encodeURIComponent(c.id) + '/evidence/export', { headers: headers })
          .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, status: r.status, body: b }; }); })
          .then(function (r) {
            btn.textContent = 'Export redacted evidence';
            btn.disabled = false;
            if (!r.ok) {
              if (r.status === 401 || r.status === 403) {
                out.textContent = 'Merchant authorization required: enter the correct merchant key in the refund queue above to export evidence.';
              } else {
                out.textContent = (r.body && (r.body.message || r.body.error)) || ('Request failed (' + r.status + ')');
              }
              out.hidden = false;
              return;
            }
            var pkg = r.body.package || {};
            var narrative = (pkg.disputeDefense && pkg.disputeDefense.narrative) || JSON.stringify(pkg.timeline || [], null, 2);
            out.textContent = narrative;
            out.hidden = false;
          })
          .catch(function () {
            btn.textContent = 'Export redacted evidence';
            btn.disabled = false;
            out.textContent = 'Could not reach the server.';
            out.hidden = false;
          });
      };
      var row = el('div', 'refund-actions');
      row.appendChild(btn);
      li.appendChild(row);
      li.appendChild(out);
      evidenceList.appendChild(li);
    });
  }

  function renderError(msg) {
    setNode('acsBadge', 'error');
    setNode('acsMuted', msg || 'Could not load operational data.');
    clearNode('acsMandate');
    clearNode('acsTimeline');
    clearNode('acsBills');
    clearNode('acsDisputes');
    clearNode('acsWellbeing');
    clearNode('acsRefunds');
  }

  async function fetchSummary() {
    try {
      var resp = await fetch('/api/dashboard/summary', { headers: opsHeaders() });
      if (resp.status === 401) {
        renderError('This dashboard is private. Enter the merchant key in the refund queue above.');
        return;
      }
      if (resp.status === 503) {
        renderError('Dashboard data is private on this server. Local demo: start it with "npm run demo" (sample data, no key needed). Otherwise set OPS_COPILOT_KEY (16+ characters) and enter it in the refund queue above.');
        return;
      }
      if (!resp.ok) {
        renderError('Could not load operational data (server error, status ' + resp.status + ').');
        return;
      }
      var data = await resp.json();
      renderSummary(data);
    } catch (err) {
      renderError('Could not load operational data (connection error).');
    }
  }

  // Initial fetch + 5s refresh (aligned with the dashboard's own cycle).
  fetchSummary();
  setInterval(function () { fetchSummary(); }, 5000);
})();
