(function () {
  'use strict';

  var VALID_DECISIONS = ['AUTO_ALLOW', 'REQUIRE_CONFIRMATION', 'BLOCK'];

  // ----- Theming API (AG Grid Community, v33) -----
  // Explicit high-contrast accent so the focused-cell border and row selection
  // are clearly visible (WCAG 2.4.7 — visible focus). Quartz defaults otherwise.
  var lightTheme = agGrid.themeQuartz.withParams({
    accentColor: '#1d4ed8'
  });
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
    // AI_ASSISTED = the storefront chat assistant helped a human shopper;
    // AI_AGENT = an external agent (MCP) prepared the cart. Both are AI, only
    // the actor differs (FIX-04 / PP18).
    if (value === 'AI_AGENT') return makeBadge('AI agent', 'badge-ai');
    if (value === 'AI_ASSISTED') return makeBadge('AI assisted', 'badge-ai');
    return makeBadge('HUMAN', 'badge-human');
  }

  function pickupStatusChip(params) {
    var value = (params.value || '').toUpperCase();
    if (value === 'HELD') return makeBadge('HELD', 'badge-held');
    if (value === 'CONFIRMED') return makeBadge('CONFIRMED', 'badge-confirmed');
    if (value === 'RELEASED') return makeBadge('RELEASED', 'badge-released');
    return makeBadge(value || '—', 'badge-neutral');
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
    orders: { api: null, rows: new Map(), initial: true },
    events: { api: null, rows: new Map(), initial: true },
    pickup: { api: null, rows: new Map(), initial: true }
  };

  // Priority 3: last full payloads, for the JSON export buttons.
  var lastOrdersJson = [];
  var lastEventsJson = [];
  var lastPickupJson = [];

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

  // Merchant pickup plan: one grid row per booking. The slot's capacity usage is
  // carried on each row so the merchant sees both slots and occupancy. We never
  // copy the customer's sessionId into a grid row (internal handle, not useful
  // to a merchant and must not leak into CSV/JSON exports).
  function fmtClock(value) {
    var d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function normalizePickup(slot) {
    var rows = [];
    var windowTxt = fmtClock(slot.startTs) + ' – ' + fmtClock(slot.endTs);
    var bookings = slot.bookings || [];
    if (!bookings.length) {
      // Show empty slots too so the merchant can see unused capacity windows.
      rows.push({
        id: slot.id,
        day: slot.day,
        window: windowTxt,
        capacity: slot.capacity,
        reservedCount: slot.reservedCount,
        remaining: slot.remaining,
        status: '',
        orderId: '',
        expiresAt: null
      });
      return rows;
    }
    bookings.forEach(function (b) {
      rows.push({
        id: b.id,
        day: slot.day,
        window: windowTxt,
        capacity: slot.capacity,
        reservedCount: slot.reservedCount,
        remaining: slot.remaining,
        status: b.status,
        orderId: b.orderId || '',
        expiresAt: b.expiresAt ? new Date(b.expiresAt) : null
      });
    });
    return rows;
  }

  // Priority 3: allow-list projection for the JSON export. The server's
  // /api/pickup/plan payload includes per-booking internal fields (notably
  // sessionId). We never serialize the raw payload — we copy only the
  // operational fields the merchant needs. Anything not listed here (session
  // ids, tokens, credentials, etc.) is intentionally dropped.
  function projectPickupJsonForExport(slot) {
    var out = {
      id: slot.id,
      day: slot.day,
      startTs: slot.startTs,
      endTs: slot.endTs,
      capacity: slot.capacity,
      reservedCount: slot.reservedCount,
      remaining: slot.remaining
    };
    var bookings = slot.bookings || [];
    if (bookings.length) {
      out.bookings = bookings.map(function (b) {
        return {
          id: b.id,
          orderId: b.orderId ? b.orderId : null,
          status: b.status,
          expiresAt: b.expiresAt
        };
      });
    }
    return out;
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
    // Headline = what the merchant keeps (captured minus approved refunds); the sub line shows both.
    var hasNet = oStats.netRevenueMinor != null;
    var revenue = (hasNet && oStats.netRevenueFormatted) || oStats.revenueFormatted || formatMoneyFallback(oStats.revenueMinor || 0);

    el('totalOrdersValue').textContent = String(total);
    el('totalOrdersSub').textContent = total + ' total orders';
    el('aiShareValue').textContent = aiPct + '%';
    el('aiShareSub').textContent = aiCount + ' AI-assisted of ' + total;
    el('blockedValue').textContent = String(blocked);
    el('blockedSub').textContent = 'policy violations';
    el('revenueValue').textContent = revenue;
    el('revenueSub').textContent = hasNet && (oStats.refundedMinor || 0) > 0
      ? (oStats.revenueFormatted || '') + ' captured · ' + (oStats.refundedFormatted || '') + ' refunded' +
        ((oStats.pendingRefundMinor || 0) > 0 ? ' · ' + oStats.pendingRefundMinor + ' minor pending' : '')
      : (oStats.revenueMinor || 0) + ' minor captured';

    // Priority 3: reconciliation summary — policy block rate and average basket.
    var checks = eStats.totalRequests || 0;
    var blockRate = checks > 0 ? Math.round((blocked / checks) * 100) : 0;
    var blockRateValue = el('blockRateValue');
    if (blockRateValue) blockRateValue.textContent = blockRate + '%';
    var blockRateSub = el('blockRateSub');
    if (blockRateSub) blockRateSub.textContent = blocked + ' of ' + checks + ' policy checks';
    var avgMinor = total > 0 ? Math.round((oStats.revenueMinor || 0) / total) : 0;
    var avgBasketValue = el('avgBasketValue');
    if (avgBasketValue) avgBasketValue.textContent = formatMoney(avgMinor, 'EUR');
    var avgBasketSub = el('avgBasketSub');
    if (avgBasketSub) avgBasketSub.textContent = 'across ' + total + ' orders';
  }

  function setLastUpdated() {
    el('lastUpdatedText').textContent = 'Updated ' + new Date().toLocaleTimeString();
  }

  // ----- Side panel (textContent only) -----
  var panelOpen = false;
  var lastFocusedEl = null;

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

    // Move focus into the dialog (keyboard users) and remember what opened it so
    // we can restore focus on close. The panel is focusable via tabindex="-1".
    panelOpen = true;
    lastFocusedEl = document.activeElement;
    side.addEventListener('keydown', trapPanelKeys);
    // Defer one frame so the panel's open transition/layout is ready for focus.
    window.requestAnimationFrame(function () { side.focus(); });
  }

  // Keep keyboard focus inside the modal dialog and close it on Escape.
  function trapPanelKeys(e) {
    if (!panelOpen) return;
    var side = el('eventModal');
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSidePanel();
      return;
    }
    if (e.key !== 'Tab') return;
    var focusables = side.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusables.length) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
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
    side.removeEventListener('keydown', trapPanelKeys);
    panelOpen = false;
    // Restore focus to whatever opened the panel (best effort).
    if (lastFocusedEl && typeof lastFocusedEl.focus === 'function') {
      lastFocusedEl.focus();
    }
    lastFocusedEl = null;
  }

  // ----- Screen-reader cell labels -----
  // The compact visual chips ("AI"/"HUMAN", "PAID", "BLOCK") are not descriptive
  // enough for a screen reader, so each semantic cell gets a fuller aria-label
  // that still carries the column context.
  //
  // AG Grid v33 has NO `getCellAria` colDef property. The v33.0.0 bundle only
  // contains a private `getCellAriaRole()` method on the cell controller, and
  // `cellAriaRole` is a real colDef property but it sets the cell's ROLE, not its
  // label. Passing `getCellAria` therefore logs "invalid colDef property".
  // The supported way to label a cell is the documented cell-renderer param
  // `ICellRendererParams.eGridCell`: the renderer owns the cell element and can
  // set its aria-label directly.
  function originLabel(params) {
    var value = (params.value || '').toUpperCase();
    if (value === 'AI_AGENT') return 'Origin: AI agent';
    if (value === 'AI_ASSISTED') return 'Origin: AI assisted';
    return 'Origin: Human';
  }
  function statusLabel(params) {
    var value = (params.value || '').toUpperCase();
    return 'Status: ' + (value || 'unknown');
  }
  function decisionLabel(params) {
    var value = (params.value || '').toUpperCase();
    var label = value === 'REQUIRE_CONFIRMATION' ? 'Require confirmation'
      : value === 'AUTO_ALLOW' ? 'Auto allow'
      : value === 'BLOCK' ? 'Blocked' : (value || 'unknown');
    return 'Decision: ' + label;
  }
  function pickupStatusLabel(params) {
    var value = (params.value || '').toUpperCase();
    if (value === 'HELD') return 'Pickup status: Held';
    if (value === 'CONFIRMED') return 'Pickup status: Confirmed';
    if (value === 'RELEASED') return 'Pickup status: Released';
    return 'Pickup status: ' + (value || 'unknown');
  }

  // Wraps a renderer so the grid cell itself carries the descriptive label.
  function withCellLabel(renderer, labelFor) {
    return function (params) {
      var node = renderer(params);
      var cell = params && params.eGridCell;
      var label = labelFor(params || {});
      if (cell && typeof cell.setAttribute === 'function' && label) {
        cell.setAttribute('aria-label', label);
      }
      return node;
    };
  }

  // ----- Grid definitions -----
  // AG Grid COMMUNITY only: no rowGroup / aggFunc / enableValue / statusBar here, those are
  // Enterprise features (RowGroupingModule, StatusBarModule) and Community logs error #200
  // for each and ignores them. Sort, filter, pin, paginate and CSV export are Community.
  var ordersColumnDefs = [
    { headerName: 'Order ID', field: 'id', pinned: 'left', minWidth: 200, cellRenderer: shortIdRenderer },
    { headerName: 'Created', field: 'createdAt', filter: 'agDateColumnFilter', valueFormatter: dateFormatter, sort: 'desc', minWidth: 170 },
    { headerName: 'Origin', field: 'origin', cellRenderer: withCellLabel(originBadge, originLabel), filter: 'agTextColumnFilter', minWidth: 120 },
    { headerName: 'Status', field: 'status', cellRenderer: withCellLabel(statusChip, statusLabel), filter: 'agTextColumnFilter', minWidth: 130 },
    { headerName: 'Items', field: 'itemCount', filter: 'agNumberColumnFilter', type: 'numericColumn', minWidth: 100 },
    { headerName: 'Total', field: 'totalMinor', valueFormatter: currencyFormatter, filter: 'agNumberColumnFilter', type: 'numericColumn', minWidth: 130 },
    { headerName: 'Currency', field: 'currency', filter: 'agTextColumnFilter', minWidth: 110 }
  ];

  var eventsColumnDefs = [
    { headerName: 'Time', field: 'timestamp', pinned: 'left', filter: 'agDateColumnFilter', valueFormatter: dateFormatter, sort: 'desc', minWidth: 170 },
    { headerName: 'Agent', field: 'agent', cellRenderer: withCellLabel(originBadge, originLabel), filter: 'agTextColumnFilter', minWidth: 120 },
    { headerName: 'Cart ID', field: 'cartId', cellRenderer: shortIdRenderer, filter: 'agTextColumnFilter', minWidth: 160 },
    { headerName: 'Order ID', field: 'orderId', cellRenderer: shortIdRenderer, filter: 'agTextColumnFilter', minWidth: 160 },
    { headerName: 'Decision', field: 'decision', cellRenderer: withCellLabel(decisionChip, decisionLabel), filter: 'agTextColumnFilter', minWidth: 180 },
    { headerName: 'Amount', field: 'amountMinor', valueFormatter: currencyFormatter, filter: 'agNumberColumnFilter', type: 'numericColumn', minWidth: 130 },
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

  // Pickup plan grid. `day` is an ISO date string (lexicographic sort == date
  // order), and each booking row copies the slot's capacity usage. No session id
  // column — a merchant must never see a customer's internal session handle.
  var pickupColumnDefs = [
    { headerName: 'Day', field: 'day', pinned: 'left', sort: 'asc', filter: 'agTextColumnFilter', minWidth: 150,
      // Sort on the raw ISO date; show a readable weekday + date.
      valueFormatter: function (p) {
        if (!p.value || !/^\d{4}-\d{2}-\d{2}$/.test(p.value)) return p.value || '';
        return new Date(p.value + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
      } },
    { headerName: 'Window', field: 'window', filter: 'agTextColumnFilter', minWidth: 180 },
    { headerName: 'Capacity', field: 'capacity', type: 'numericColumn', filter: 'agNumberColumnFilter', minWidth: 100 },
    { headerName: 'Reserved', field: 'reservedCount', type: 'numericColumn', filter: 'agNumberColumnFilter', minWidth: 110 },
    { headerName: 'Remaining', field: 'remaining', type: 'numericColumn', filter: 'agNumberColumnFilter', minWidth: 110 },
    { headerName: 'Status', field: 'status', cellRenderer: withCellLabel(pickupStatusChip, pickupStatusLabel), filter: 'agTextColumnFilter', minWidth: 130 },
    { headerName: 'Order Ref', field: 'orderId', cellRenderer: shortIdRenderer, filter: 'agTextColumnFilter', minWidth: 160 },
    { headerName: 'Booking ID', field: 'id', cellRenderer: shortIdRenderer, filter: 'agTextColumnFilter', minWidth: 160 }
  ];

  var defaultColDef = {
    flex: 1,
    minWidth: 120,
    sortable: true,
    resizable: true,
    filter: true,
    enableCellChangeFlash: true
  };

  // Accessible overlays for empty / loading states (Community string templates).
  var NO_ROWS_TEMPLATE = '<span class="ag-overlay-no-rows">No data to display yet.</span>';
  var LOADING_TEMPLATE = '<span class="ag-overlay-loading">Loading data…</span>';

  // Live-region helpers for each grid's status (polite) and error (alert) text.
  function setGridStatus(name, msg) {
    var node = el(name + 'Status');
    if (node) node.textContent = msg;
  }
  function setGridError(name, msg) {
    var node = el(name + 'Error');
    if (!node) return;
    if (msg) { node.textContent = msg; node.hidden = false; }
    else { node.textContent = ''; node.hidden = true; }
  }

  // Open the detail dialog when a focused cell is activated with Enter or Space,
  // so the grid is fully keyboard-operable (mouse click still works via onRowClicked).
  function makeCellOpenHandler(kind) {
    return function (params) {
      if (params.editing) return;
      var key = params.event && params.event.key;
      if ((key === 'Enter' || key === ' ') && params.data) {
        params.event.preventDefault();
        openSidePanel(params.data, kind);
      }
    };
  }

  // AG Grid puts its own role ("grid"; "treegrid" only with Enterprise grouping/tree data)
  // on its OWN inner root element and does not copy anything from our container. So the
  // container carries no ARIA role, and the accessible name is attached to
  // AG Grid's real root, tied to the visible section heading.
  function labelGridRoot(containerId, headingId) {
    var container = el(containerId);
    if (!container || typeof container.querySelector !== 'function') return;
    var root = container.querySelector('.ag-root');
    if (root && typeof root.setAttribute === 'function') {
      root.setAttribute('aria-labelledby', headingId);
    }
  }

  var ordersApi = agGrid.createGrid(el('ordersGrid'), {
    columnDefs: ordersColumnDefs,
    defaultColDef: defaultColDef,
    getRowId: function (params) { return params.data.id; },
    pagination: true,
    paginationPageSize: 15,
    paginationPageSizeSelector: [15, 50, 100],
    tooltipShowDelay: 400,
    theme: lightTheme,
    rowData: [],
    // AG Grid's documented screen-reader option: keep row/column DOM order stable.
    ensureDomOrder: true,
    // v33 overlay API: the `loading` grid option replaces the deprecated
    // showLoadingOverlay()/hideOverlay() pair. `loading: true` shows the loading
    // overlay on the first paint; setting it to false afterwards hides it and
    // lets AG Grid show the no-rows overlay on its own when rowData is empty.
    loading: true,
    overlayNoRowsTemplate: NO_ROWS_TEMPLATE,
    overlayLoadingTemplate: LOADING_TEMPLATE,
    onRowClicked: function (params) { openSidePanel(params.data, 'orders'); },
    onCellKeyDown: makeCellOpenHandler('orders')
  });
  state.orders.api = ordersApi;
  labelGridRoot('ordersGrid', 'ordersHeading');

  var eventsApi = agGrid.createGrid(el('eventsGrid'), {
    columnDefs: eventsColumnDefs,
    defaultColDef: defaultColDef,
    getRowId: function (params) { return params.data.id; },
    pagination: true,
    paginationPageSize: 15,
    paginationPageSizeSelector: [15, 50, 100],
    tooltipShowDelay: 400,
    theme: lightTheme,
    rowData: [],
    // AG Grid's documented screen-reader option: keep row/column DOM order stable.
    ensureDomOrder: true,
    loading: true,
    overlayNoRowsTemplate: NO_ROWS_TEMPLATE,
    overlayLoadingTemplate: LOADING_TEMPLATE,
    onRowClicked: function (params) { openSidePanel(params.data, 'events'); },
    onCellKeyDown: makeCellOpenHandler('events')
  });
  state.events.api = eventsApi;
  labelGridRoot('eventsGrid', 'eventsHeading');

  var pickupApi = agGrid.createGrid(el('pickupGrid'), {
    columnDefs: pickupColumnDefs,
    defaultColDef: defaultColDef,
    getRowId: function (params) { return params.data.id; },
    pagination: true,
    paginationPageSize: 15,
    paginationPageSizeSelector: [15, 50, 100],
    tooltipShowDelay: 400,
    theme: lightTheme,
    rowData: [],
    ensureDomOrder: true,
    loading: true,
    overlayNoRowsTemplate: NO_ROWS_TEMPLATE,
    overlayLoadingTemplate: LOADING_TEMPLATE
  });
  state.pickup.api = pickupApi;
  labelGridRoot('pickupGrid', 'pickupHeading');

  // Test-only handle so the dashboard unit suite can verify the JSON export
  // projection drops sensitive fields (sessionId, tokens, credentials). It is
  // not user-facing and is never rendered or serialized.
  pickupApi.__jsonProjection = projectPickupJsonForExport;

  // Attach line items onto order rows for the side panel (not shown in grid).
  function attachOrderItems(orders, jsonOrders) {
    orders.forEach(function (o, i) {
      o.__items = (jsonOrders[i] && jsonOrders[i].items) || [];
    });
    return orders;
  }

  // ----- Refresh loop (5s) -----
  // v33 overlay API: the `loading` grid option replaces showLoadingOverlay() and
  // the showNoRowsOverlay()/hideOverlay() pair. Flipping `loading` to false hides
  // the loading overlay and lets AG Grid show the no-rows overlay by itself when
  // the row data is empty, so the empty state no longer needs manual handling.
  function setGridLoading(api, isLoading) {
    if (api && typeof api.setGridOption === 'function') {
      api.setGridOption('loading', isLoading);
    }
  }

  // Merchant key for private mode (DASHBOARD_PUBLIC=false); empty headers in the public demo.
  function opsHeaders() {
    try {
      var k = sessionStorage.getItem('aicafe.opsKey');
      return k ? { 'X-Ops-Key': k } : {};
    } catch (e) {
      return {};
    }
  }

  async function refreshData() {
    // Clear any previous error announcement at the start of each cycle.
    setGridError('orders', '');
    setGridError('events', '');
    setGridError('pickup', '');

    var oResp, oStatsResp, eResp, eStatsResp, pResp;
    try {
      // Show the loading overlay only on the first load (not every 5s poll).
      if (state.orders.initial) { setGridLoading(ordersApi, true); setGridStatus('orders', 'Loading orders…'); }
      if (state.events.initial) { setGridLoading(eventsApi, true); setGridStatus('events', 'Loading policy events…'); }
      if (state.pickup.initial) { setGridLoading(pickupApi, true); setGridStatus('pickup', 'Loading pickup plan…'); }
      // When the server runs with DASHBOARD_PUBLIC=false these need the merchant key (same one the
      // refund queue uses, kept in sessionStorage for this tab only).
      var authInit = { headers: opsHeaders() };
      oResp = await fetch('/api/orders', authInit);
      oStatsResp = await fetch('/api/orders/stats', authInit);
      eResp = await fetch('/api/policy-events?limit=100', authInit);
      eStatsResp = await fetch('/api/policy-events/stats', authInit);
      pResp = await fetch('/api/pickup/plan', authInit);
    } catch (err) {
      // Non-fatal: keep previous rows; surface an accessible error message.
      // Clear the loading state so a first-load failure cannot leave the grid
      // spinning forever behind the error.
      console.warn('dashboard refresh skipped:', err && err.message);
      setGridLoading(ordersApi, false);
      setGridLoading(eventsApi, false);
      setGridLoading(pickupApi, false);
      if (state.orders.initial) {
        setGridError('orders', 'Could not load orders (connection error). Retrying automatically.');
        setGridStatus('orders', 'Orders could not be loaded.');
      }
      if (state.events.initial) {
        setGridError('events', 'Could not load policy events (connection error). Retrying automatically.');
        setGridStatus('events', 'Policy events could not be loaded.');
      }
      if (state.pickup.initial) {
        setGridError('pickup', 'Could not load pickup plan (connection error). Retrying automatically.');
        setGridStatus('pickup', 'Pickup plan could not be loaded.');
      }
      return;
    }

    if (oResp.status === 401 || eResp.status === 401 || pResp.status === 401) {
      setGridLoading(ordersApi, false);
      setGridLoading(eventsApi, false);
      setGridLoading(pickupApi, false);
      var privateMsg = 'This dashboard is private. Enter the merchant key in the refund queue below.';
      setGridError('orders', privateMsg);
      setGridError('events', privateMsg);
      setGridError('pickup', privateMsg);
      return;
    }

    if (!oResp.ok || !eResp.ok || !pResp.ok) {
      console.warn('dashboard refresh: upstream returned non-200');
      setGridLoading(ordersApi, false);
      setGridLoading(eventsApi, false);
      setGridLoading(pickupApi, false);
      if (state.orders.initial) {
        setGridError('orders', 'Could not load orders (server error). Retrying automatically.');
        setGridStatus('orders', 'Orders could not be loaded.');
      }
      if (state.events.initial) {
        setGridError('events', 'Could not load policy events (server error). Retrying automatically.');
        setGridStatus('events', 'Policy events could not be loaded.');
      }
      if (state.pickup.initial) {
        setGridError('pickup', 'Could not load pickup plan (server error). Retrying automatically.');
        setGridStatus('pickup', 'Pickup plan could not be loaded.');
      }
      return;
    }

    var oJson = await oResp.json();
    var eJson = await eResp.json();
    var pJson = await pResp.json();
    lastOrdersJson = oJson.orders || [];
    lastEventsJson = eJson.events || [];
    lastPickupJson = (pJson.slots || []).map(projectPickupJsonForExport);
    var ordersRaw = (oJson.orders || []).map(normalizeOrder);
    attachOrderItems(ordersRaw, oJson.orders || []);
    var eventsRaw = (eJson.events || []).map(normalizeEvent);
    var pickupRaw = [];
    (pJson.slots || []).forEach(function (slot) {
      normalizePickup(slot).forEach(function (r) { pickupRaw.push(r); });
    });

    applyDiff('orders', ordersRaw);
    applyDiff('events', eventsRaw);
    applyDiff('pickup', pickupRaw);

    // Reflect empty / populated state. `loading: false` hides the loading
    // overlay; AG Grid shows its no-rows overlay on its own when there are no
    // rows, so no explicit showNoRowsOverlay()/hideOverlay() call is needed.
    setGridLoading(ordersApi, false);
    setGridLoading(eventsApi, false);
    setGridLoading(pickupApi, false);

    var oStats = oStatsResp.ok ? await oStatsResp.json() : {};
    var eStats = eStatsResp.ok ? await eStatsResp.json() : {};
    updateKpis(oStats, eStats);
    setLastUpdated();

    var ordersLabel = ordersRaw.length + ' order' + (ordersRaw.length === 1 ? '' : 's');
    var eventsLabel = eventsRaw.length + ' policy event' + (eventsRaw.length === 1 ? '' : 's');
    var pickupLabel = pickupRaw.length + ' booking' + (pickupRaw.length === 1 ? '' : 's');
    if (state.orders.initial) {
      state.orders.initial = false;
      setGridStatus('orders', ordersRaw.length ? ('Showing ' + ordersLabel + '.') : 'No orders to display yet.');
    } else {
      setGridStatus('orders', 'Updated: ' + ordersLabel + '.');
    }
    if (state.events.initial) {
      state.events.initial = false;
      setGridStatus('events', eventsRaw.length ? ('Showing ' + eventsLabel + '.') : 'No policy events to display yet.');
    } else {
      setGridStatus('events', 'Updated: ' + eventsLabel + '.');
    }
    if (state.pickup.initial) {
      state.pickup.initial = false;
      setGridStatus('pickup', pickupRaw.length ? ('Showing ' + pickupLabel + '.') : 'No pickup bookings to display yet.');
    } else {
      setGridStatus('pickup', 'Updated: ' + pickupLabel + '.');
    }
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

  // Priority 3: JSON export + print / save-as-PDF. Guarded because the DOM shim
  // used by the a11y unit test does not define these nodes.
  function downloadJson(fileName, data) {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  var ordersJsonBtn = el('ordersJsonBtn');
  if (ordersJsonBtn) ordersJsonBtn.addEventListener('click', function () { downloadJson('orders.json', lastOrdersJson); });
  var eventsJsonBtn = el('eventsJsonBtn');
  if (eventsJsonBtn) eventsJsonBtn.addEventListener('click', function () { downloadJson('policy-events.json', lastEventsJson); });

  var pickupQuickFilter = el('pickupQuickFilter');
  if (pickupQuickFilter) pickupQuickFilter.addEventListener('input', function (e) {
    pickupApi.setGridOption('quickFilterText', e.target.value);
  });
  var pickupCsvBtn = el('pickupCsvBtn');
  if (pickupCsvBtn) pickupCsvBtn.addEventListener('click', function () {
    pickupApi.exportDataAsCsv({ fileName: 'pickup-plan.csv' });
  });
  var pickupJsonBtn = el('pickupJsonBtn');
  if (pickupJsonBtn) pickupJsonBtn.addEventListener('click', function () {
    downloadJson('pickup-plan.json', lastPickupJson);
  });
  var printBtn = el('printBtn');
  if (printBtn) printBtn.addEventListener('click', function () { window.print(); });

  el('closeSide').addEventListener('click', closeSidePanel);
  el('sideBackdrop').addEventListener('click', closeSidePanel);

  el('themeToggle').addEventListener('click', function () {
    dark = !dark;
    var theme = dark ? darkTheme : lightTheme;
    ordersApi.setGridOption('theme', theme);
    eventsApi.setGridOption('theme', theme);
    pickupApi.setGridOption('theme', theme);
    document.body.classList.toggle('dark', dark);
    el('themeToggle').textContent = dark ? 'Light mode' : 'Dark mode';
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
