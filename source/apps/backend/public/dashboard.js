(function () {
  'use strict';

  var VALID_DECISIONS = ['AUTO_ALLOW', 'REQUIRE_CONFIRMATION', 'BLOCK'];

  // ----- Theming API (AG Grid Community, v33) -----
  var lightTheme = agGrid.themeQuartz;
  var darkTheme = agGrid.themeQuartz.withParams({
    backgroundColor: '#1b2530',
    foregroundColor: '#dbe4ee',
    chromeBackgroundColor: '#16202b',
    headerBackgroundColor: '#16202b',
    headerTextColor: '#9fb0c0',
    borderColor: '#2c3a47',
    oddRowBackgroundColor: '#1f2b37',
    rowHoverColor: '#26333f',
    accentColor: '#4f9cf9'
  });
  var dark = false;

  function el(id) {
    return document.getElementById(id);
  }

  function shortenId(id) {
    if (!id) return '';
    var str = String(id);
    if (str.length <= 16) return str;
    return str.slice(0, 8) + '…' + str.slice(-8);
  }

  function formatMoney(minor, currency) {
    var cur = currency || 'EUR';
    if (typeof minor !== 'number') return '—';
    try {
      return (minor / 100).toLocaleString(undefined, {
        style: 'currency',
        currency: cur,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    } catch (e) {
      return (minor / 100).toFixed(2) + ' ' + cur;
    }
  }

  function formatMoneyFallback(minor) {
    return formatMoney(minor, 'EUR');
  }

  function formatTimestamp(value) {
    if (!value) return '—';
    var d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString();
  }

  // ----- DOM-based renderers (textContent only, no innerHTML) -----
  function makeBadge(text, cls) {
    var span = document.createElement('span');
    span.className = 'badge ' + cls;
    span.textContent = text;
    return span;
  }

  function decisionChip(params) {
    var value = (params.value || '').toUpperCase();
    var normalized = VALID_DECISIONS.indexOf(value) >= 0 ? value : 'AUTO_ALLOW';
    var label = value === 'REQUIRE_CONFIRMATION' ? 'REQUIRE CONFIRMATION' : value;
    var cls = 'badge-allow';
    if (normalized === 'REQUIRE_CONFIRMATION') cls = 'badge-confirm';
    else if (normalized === 'BLOCK') cls = 'badge-block';
    return makeBadge(label || '—', cls);
  }

  function statusChip(params) {
    var value = (params.value || '').toUpperCase();
    if (value === 'PAID') return makeBadge('PAID', 'badge-paid');
    if (value === 'CANCELLED') return makeBadge('CANCELLED', 'badge-cancelled');
    return makeBadge(value || '—', 'badge-neutral');
  }

  function originBadge(params) {
    var value = (params.value || '').toUpperCase();
    if (value === 'AI_AGENT') return makeBadge('AI', 'badge-ai');
    return makeBadge('HUMAN', 'badge-human');
  }

  function shortIdRenderer(params) {
    var span = document.createElement('span');
    span.textContent = shortenId(params.value);
    span.title = params.value || '';
    return span;
  }

  function violationsRenderer(params) {
    var violations = params.value || [];
    var span = document.createElement('span');
    if (!violations.length) {
      span.textContent = '—';
      return span;
    }
    span.textContent = violations
      .map(function (v) { return v.type || 'UNKNOWN'; })
      .join(', ');
    span.title = violations
      .map(function (v) { return (v.type || 'UNKNOWN') + ': ' + (v.message || v.rule || ''); })
      .join('\n');
    return span;
  }

  // `violatedRules` is an array (an object), so AG Grid needs a valueFormatter
  // for sorting/filtering/export — otherwise it logs error #48.
  function violationsFormatter(params) {
    var violations = params.value || [];
    if (!violations.length) return '—';
    return violations
      .map(function (v) { return v.type || 'UNKNOWN'; })
      .join(', ');
  }

  function currencyFormatter(params) {
    return formatMoney(params.value, params.data && params.data.currency);
  }

  function dateFormatter(params) {
    return formatTimestamp(params.value);
  }

  // ----- Grid state with change-tracking for applyTransaction -----
  var state = {
    orders: { api: null, rows: new Map() },
    events: { api: null, rows: new Map() }
  };

  function normalizeOrder(o) {
    return {
      id: o.id,
      createdAt: o.createdAt ? new Date(o.createdAt) : null,
      origin: o.origin,
      status: o.status,
      itemCount: o.itemCount,
      totalMinor: o.totalMinor,
      currency: o.currency
    };
  }

  function normalizeEvent(e) {
    return {
      id: e.id,
      timestamp: e.timestamp ? new Date(e.timestamp) : null,
      agent: e.agent,
      cartId: e.cartId,
      orderId: e.orderId,
      decision: e.decision,
      amountMinor: e.amountMinor,
      currency: e.currency,
      reason: e.reason,
      violatedRules: e.violatedRules || []
    };
  }

  function applyDiff(name, rows) {
    var st = state[name];
    var newMap = new Map();
    var add = [];
    var update = [];
    var remove = [];
    rows.forEach(function (r) { newMap.set(r.id, JSON.stringify(r)); });
    rows.forEach(function (r) {
      if (!st.rows.has(r.id)) add.push(r);
      else if (st.rows.get(r.id) !== JSON.stringify(r)) update.push(r);
    });
    st.rows.forEach(function (_v, id) {
      if (!newMap.has(id)) remove.push({ id: id });
    });
    if (add.length || update.length || remove.length) {
      st.api.applyTransaction({ add: add, update: update, remove: remove });
    }
    st.rows = newMap;
  }

  // ----- KPI cards -----
  function updateKpis(oStats, eStats) {
    oStats = oStats || {};
    eStats = eStats || {};
    var total = oStats.total || 0;
    var aiPct = oStats.aiAssistedPercentage != null ? oStats.aiAssistedPercentage : 0;
    var aiCount = oStats.aiAssisted || 0;
    var blocked = eStats.blocked || 0;
    var revenue = oStats.revenueFormatted || formatMoneyFallback(oStats.revenueMinor || 0);

    el('totalOrdersValue').textContent = String(total);
    el('totalOrdersSub').textContent = total + ' total orders';
    el('aiShareValue').textContent = aiPct + '%';
    el('aiShareSub').textContent = aiCount + ' AI-assisted of ' + total;
    el('blockedValue').textContent = String(blocked);
    el('blockedSub').textContent = 'policy violations';
    el('revenueValue').textContent = revenue;
    el('revenueSub').textContent = (oStats.revenueMinor || 0) + ' minor captured';
  }

  function setLastUpdated() {
    el('lastUpdatedText').textContent = 'Updated ' + new Date().toLocaleTimeString();
  }

  // ----- Side panel (textContent only) -----
  function openSidePanel(data, kind) {
    var side = el('eventModal');
    var body = el('sideBody');
    body.textContent = '';

    if (!data) return;

    if (kind === 'orders') {
      el('sideTitle').textContent = 'Order detail';
      addDetail(body, 'Order ID', shortenId(data.id));
      addDetail(body, 'Created', formatTimestamp(data.createdAt));
      addBadgeDetail(body, 'Origin', originBadge({ value: data.origin }));
      addBadgeDetail(body, 'Status', statusChip({ value: data.status }));
      addDetail(body, 'Items', String(data.itemCount));
      addDetail(body, 'Total', formatMoney(data.totalMinor, data.currency));
      addDetail(body, 'Currency', data.currency || 'EUR');
      var items = data.__items || [];
      if (items.length) {
        var title = document.createElement('div');
        title.className = 'detail-group-title';
        title.textContent = 'Line items';
        body.appendChild(title);
        items.forEach(function (it) {
          addDetail(body, it.productId, it.quantity + ' × ' + formatMoney(it.lineTotalMinor, data.currency));
        });
      }
    } else {
      el('sideTitle').textContent = 'Policy event detail';
      addDetail(body, 'Event ID', shortenId(data.id));
      addDetail(body, 'Time', formatTimestamp(data.timestamp));
      addDetail(body, 'Agent', data.agent || '—');
      addDetail(body, 'Cart ID', shortenId(data.cartId));
      addDetail(body, 'Order ID', shortenId(data.orderId));
      addBadgeDetail(body, 'Decision', decisionChip({ value: data.decision }));
      addDetail(body, 'Amount', formatMoney(data.amountMinor, data.currency));
      addDetail(body, 'Currency', data.currency || 'EUR');
      addDetail(body, 'Reason', data.reason || '—');
      var v = data.violatedRules || [];
      if (v.length) {
        var vtitle = document.createElement('div');
        vtitle.className = 'detail-group-title';
        vtitle.textContent = 'Violated rules';
        body.appendChild(vtitle);
        v.forEach(function (rule) {
          addDetail(body, rule.type || 'UNKNOWN', rule.message || rule.rule || '—');
        });
      }
    }

    side.classList.add('visible');
    side.setAttribute('aria-hidden', 'false');
    el('sideBackdrop').hidden = false;
  }

  function addDetail(parent, label, value) {
    var item = document.createElement('div');
    item.className = 'detail-item';
    var l = document.createElement('span');
    l.className = 'label';
    l.textContent = label;
    var v = document.createElement('div');
    v.className = 'value';
    v.textContent = value;
    item.appendChild(l);
    item.appendChild(v);
    parent.appendChild(item);
  }

  function addBadgeDetail(parent, label, badgeEl) {
    var item = document.createElement('div');
    item.className = 'detail-item';
    var l = document.createElement('span');
    l.className = 'label';
    l.textContent = label;
    var v = document.createElement('div');
    v.className = 'value';
    v.appendChild(badgeEl);
    item.appendChild(l);
    item.appendChild(v);
    parent.appendChild(item);
  }

  function closeSidePanel() {
    var side = el('eventModal');
    side.classList.remove('visible');
    side.setAttribute('aria-hidden', 'true');
    el('sideBackdrop').hidden = true;
  }

  // ----- Grid definitions -----
  // Columns flagged `enableRowGroup` can be used as a grouping dimension (the
  // "Group by" selectors), `enableValue`/`aggFunc:'sum'` let AG Grid aggregate
  // counts and money within groups and in the status bar.
  var ordersColumnDefs = [
    { headerName: 'Order ID', field: 'id', pinned: 'left', minWidth: 200, cellRenderer: shortIdRenderer },
    { headerName: 'Created', field: 'createdAt', filter: 'agDateColumnFilter', valueFormatter: dateFormatter, sort: 'desc', minWidth: 170 },
    { headerName: 'Origin', field: 'origin', cellRenderer: originBadge, filter: 'agTextColumnFilter', minWidth: 120, enableRowGroup: true },
    { headerName: 'Status', field: 'status', cellRenderer: statusChip, filter: 'agTextColumnFilter', minWidth: 130, enableRowGroup: true },
    { headerName: 'Items', field: 'itemCount', filter: 'agNumberColumnFilter', type: 'numericColumn', minWidth: 100, aggFunc: 'sum', enableValue: true },
    { headerName: 'Total', field: 'totalMinor', valueFormatter: currencyFormatter, filter: 'agNumberColumnFilter', type: 'numericColumn', minWidth: 130, aggFunc: 'sum', enableValue: true },
    { headerName: 'Currency', field: 'currency', filter: 'agTextColumnFilter', minWidth: 110, enableRowGroup: true }
  ];

  var eventsColumnDefs = [
    { headerName: 'Time', field: 'timestamp', pinned: 'left', filter: 'agDateColumnFilter', valueFormatter: dateFormatter, sort: 'desc', minWidth: 170 },
    { headerName: 'Agent', field: 'agent', cellRenderer: originBadge, filter: 'agTextColumnFilter', minWidth: 120, enableRowGroup: true },
    { headerName: 'Cart ID', field: 'cartId', cellRenderer: shortIdRenderer, filter: 'agTextColumnFilter', minWidth: 160 },
    { headerName: 'Order ID', field: 'orderId', cellRenderer: shortIdRenderer, filter: 'agTextColumnFilter', minWidth: 160 },
    { headerName: 'Decision', field: 'decision', cellRenderer: decisionChip, filter: 'agTextColumnFilter', minWidth: 180, enableRowGroup: true },
    { headerName: 'Amount', field: 'amountMinor', valueFormatter: currencyFormatter, filter: 'agNumberColumnFilter', type: 'numericColumn', minWidth: 130, aggFunc: 'sum', enableValue: true },
    { headerName: 'Reason', field: 'reason', filter: 'agTextColumnFilter', minWidth: 220, tooltipField: 'reason' },
    {
      headerName: 'Violations',
      field: 'violatedRules',
      cellRenderer: violationsRenderer,
      valueFormatter: violationsFormatter,
      filter: false,
      minWidth: 180,
      tooltipValueGetter: function (p) {
        var v = p.value || [];
        return v.length
          ? v.map(function (rule) { return (rule.type || 'UNKNOWN') + ': ' + (rule.message || rule.rule || ''); }).join('\n')
          : 'No violations';
      }
    }
  ];

  // Returns a fresh columnDefs array for the chosen group-by dimension. Cloning
  // (rather than mutating) keeps the base definitions reusable across toggles.
  function buildGroupedCols(base, groupField) {
    return base.map(function (col) {
      var c = {};
      for (var k in col) { if (Object.prototype.hasOwnProperty.call(col, k)) c[k] = col[k]; }
      if (groupField && c.field === groupField) {
        c.rowGroup = true;
        c.hide = true;
      } else {
        c.rowGroup = false;
        c.hide = false;
      }
      return c;
    });
  }

  var defaultColDef = {
    flex: 1,
    minWidth: 120,
    sortable: true,
    resizable: true,
    filter: true,
    enableCellChangeFlash: true
  };

  // AG Grid status bar: live count + sum/avg of the focused numeric column.
  var statusBar = {
    statusPanels: [
      { statusPanel: 'agAggregationComponent', statusPanelParams: { aggFuncs: ['count', 'sum', 'avg'] } }
    ]
  };

  var ordersApi = agGrid.createGrid(el('ordersGrid'), {
    columnDefs: ordersColumnDefs,
    defaultColDef: defaultColDef,
    getRowId: function (params) { return params.data.id; },
    pagination: true,
    paginationPageSize: 15,
    paginationPageSizeSelector: [15, 50, 100],
    tooltipShowDelay: 400,
    statusBar: statusBar,
    theme: lightTheme,
    rowData: [],
    onRowClicked: function (params) { openSidePanel(params.data, 'orders'); }
  });
  state.orders.api = ordersApi;

  var eventsApi = agGrid.createGrid(el('eventsGrid'), {
    columnDefs: eventsColumnDefs,
    defaultColDef: defaultColDef,
    getRowId: function (params) { return params.data.id; },
    pagination: true,
    paginationPageSize: 15,
    paginationPageSizeSelector: [15, 50, 100],
    tooltipShowDelay: 400,
    statusBar: statusBar,
    theme: lightTheme,
    rowData: [],
    onRowClicked: function (params) { openSidePanel(params.data, 'events'); }
  });
  state.events.api = eventsApi;

  // Attach line items onto order rows for the side panel (not shown in grid).
  function attachOrderItems(orders, jsonOrders) {
    orders.forEach(function (o, i) {
      o.__items = (jsonOrders[i] && jsonOrders[i].items) || [];
    });
    return orders;
  }

  // ----- Refresh loop (5s) -----
  async function refreshData() {
    var oResp, oStatsResp, eResp, eStatsResp;
    try {
      oResp = await fetch('/api/orders');
      oStatsResp = await fetch('/api/orders/stats');
      eResp = await fetch('/api/policy-events?limit=100');
      eStatsResp = await fetch('/api/policy-events/stats');
    } catch (err) {
      // Non-fatal: keep previous rows; surface via warn, not error.
      console.warn('dashboard refresh skipped:', err && err.message);
      return;
    }

    if (!oResp.ok || !eResp.ok) {
      console.warn('dashboard refresh: upstream returned non-200');
      return;
    }

    var oJson = await oResp.json();
    var eJson = await eResp.json();
    var ordersRaw = (oJson.orders || []).map(normalizeOrder);
    attachOrderItems(ordersRaw, oJson.orders || []);
    var eventsRaw = (eJson.events || []).map(normalizeEvent);

    applyDiff('orders', ordersRaw);
    applyDiff('events', eventsRaw);

    var oStats = oStatsResp.ok ? await oStatsResp.json() : {};
    var eStats = eStatsResp.ok ? await eStatsResp.json() : {};
    updateKpis(oStats, eStats);
    setLastUpdated();
  }

  // ----- Wiring -----
  el('ordersQuickFilter').addEventListener('input', function (e) {
    ordersApi.setGridOption('quickFilterText', e.target.value);
  });
  el('eventsQuickFilter').addEventListener('input', function (e) {
    eventsApi.setGridOption('quickFilterText', e.target.value);
  });
  el('ordersCsvBtn').addEventListener('click', function () {
    ordersApi.exportDataAsCsv({ fileName: 'orders.csv' });
  });
  el('eventsCsvBtn').addEventListener('click', function () {
    eventsApi.exportDataAsCsv({ fileName: 'policy-events.csv' });
  });

  el('closeSide').addEventListener('click', closeSidePanel);
  el('sideBackdrop').addEventListener('click', closeSidePanel);

  el('themeToggle').addEventListener('click', function () {
    dark = !dark;
    var theme = dark ? darkTheme : lightTheme;
    ordersApi.setGridOption('theme', theme);
    eventsApi.setGridOption('theme', theme);
    document.body.classList.toggle('dark', dark);
    el('themeToggle').textContent = dark ? 'Light mode' : 'Dark mode';
  });

  // Group-by selectors: rebuild columnDefs so the chosen dimension becomes the
  // row group (Community row grouping) and money/count columns aggregate.
  el('ordersGroupBy').addEventListener('change', function (e) {
    ordersApi.setGridOption('columnDefs', buildGroupedCols(ordersColumnDefs, e.target.value));
  });
  el('eventsGroupBy').addEventListener('change', function (e) {
    eventsApi.setGridOption('columnDefs', buildGroupedCols(eventsColumnDefs, e.target.value));
  });

  refreshData().catch(function (err) {
    console.warn('initial dashboard load failed:', err && err.message);
  });

  setInterval(function () {
    refreshData().catch(function (err) {
      console.warn('dashboard refresh failed:', err && err.message);
    });
  }, 5000);
})();
