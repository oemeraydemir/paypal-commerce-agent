(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var SKEY = 'aicafe.session', PKEY = 'aicafe.pending', CKEY = 'aicafe.cart';
  var catalog = {}, cart = {}, session = null, busy = false;
  var policy = null, pseq = 0, ptimer = null, activeCat = 'all', allProducts = [];

  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  function drop(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  function eur(minor) { return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(minor / 100); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }

  // Category emoji for product cards (unicode only — no external images).
  var CATEGORY_EMOJI = {
    breakfast: '🥐', drinks: '🥤', desserts: '🍰', gifts: '🎁',
    lunch: '🥪', snacks: '🍪', catering: '🍱'
  };

  function banner(kind, text) {
    var b = $('banner'); b.hidden = false; b.textContent = '';
    var d = el('div', kind, text); b.appendChild(d);
  }
  function say(role, text) {
    var m = el('div', 'msg ' + role, text); var log = $('log'); log.appendChild(m); log.scrollTop = log.scrollHeight;
  }

  // ---- API with server-issued session ------------------------------------------------------
  function newSession() {
    return fetch('/api/sessions', { method: 'POST' }).then(function (r) {
      if (!r.ok) throw new Error('Could not start a session (' + r.status + ')');
      return r.json();
    }).then(function (s) { session = { id: s.sessionId, token: s.sessionToken }; save(SKEY, session); return session; });
  }
  function api(path, opts, retried) {
    opts = opts || {};
    var headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (session) { headers['X-Session-Id'] = session.id; headers['Authorization'] = 'Bearer ' + session.token; }
    return fetch(path, Object.assign({}, opts, { headers: headers })).then(function (r) {
      if (r.status === 401 && !retried && opts.auth !== false) {
        return newSession().then(function () { return api(path, opts, true); });
      }
      return r.json().catch(function () { return {}; }).then(function (body) {
        if (!r.ok) { var e = new Error(body.message || body.error || ('Request failed (' + r.status + ')')); e.body = body; e.status = r.status; throw e; }
        return body;
      });
    });
  }

  // ---- Cart ---------------------------------------------------------------------------------
  function cartTotal() { return Object.keys(cart).reduce(function (s, id) { return s + (catalog[id] ? catalog[id].priceMinor * cart[id] : 0); }, 0); }
  function setQty(id, q) { if (q <= 0) delete cart[id]; else cart[id] = Math.min(q, 99); save(CKEY, cart); renderCart(); }
  function renderCart() {
    var box = $('cart'); box.textContent = '';
    var ids = Object.keys(cart);
    if (!ids.length) box.appendChild(el('p', 'mut', 'Your cart is empty. Ask the agent or add items from the menu.'));
    ids.forEach(function (id) {
      var p = catalog[id]; if (!p) return;
      var row = el('div', 'item'); var n = el('div', 'n'); n.appendChild(el('div', '', p.name)); n.appendChild(el('small', 'mut', eur(p.priceMinor) + ' each'));
      var q = el('div', 'q'); var minus = el('button', '', '−'); var plus = el('button', '', '+');
      minus.setAttribute('aria-label', 'Remove one ' + p.name); plus.setAttribute('aria-label', 'Add one ' + p.name);
      minus.onclick = function () { setQty(id, cart[id] - 1); }; plus.onclick = function () { setQty(id, cart[id] + 1); };
      q.appendChild(minus); q.appendChild(el('span', '', String(cart[id]))); q.appendChild(plus);
      row.appendChild(n); row.appendChild(q); box.appendChild(row);
    });
    $('total').textContent = eur(cartTotal());
    updatePay();
    schedulePolicy();
  }
  // UI convenience only: the server re-evaluates policy at /api/orders/create and is the sole authority.
  function updatePay() {
    var blocked = !!(policy && policy.decision === 'BLOCK' && Object.keys(cart).length);
    $('pay').disabled = busy || !Object.keys(cart).length || blocked;
    if (!busy) $('pay').textContent = blocked ? 'Blocked by your policy' : 'Review & pay with PayPal';
  }
  function showPolicy(c) {
    var box = $('policy-note'); box.textContent = '';
    if (!c || !c.policyDecision) return;
    var labels = { AUTO_ALLOW: 'Agent check: within your limits', REQUIRE_CONFIRMATION: 'Agent check: needs your explicit approval', BLOCK: 'Agent check: blocked' };
    var d = el('div', 'policy ' + c.policyDecision, labels[c.policyDecision] || c.policyDecision);
    if (c.reason) d.appendChild(el('div', 'mut', c.reason));
    box.appendChild(d);
  }
  function schedulePolicy() { clearTimeout(ptimer); ptimer = setTimeout(refreshPolicy, 120); }
  function refreshPolicy() {
    var items = Object.keys(cart).map(function (id) { return { productId: id, quantity: cart[id] }; });
    var seq = ++pseq;
    api('/api/policy/preview', { method: 'POST', body: JSON.stringify({ items: items }) }).then(function (p) {
      if (seq !== pseq) return; // a newer cart state is already in flight
      policy = p; renderPolicy(p); updatePay();
    }).catch(function () { if (seq === pseq) { policy = null; $('policy').textContent = ''; updatePay(); } });
  }
  var DECISION_TEXT = {
    AUTO_ALLOW: ['Within your limits', 'Checkout needs no extra confirmation.'],
    REQUIRE_CONFIRMATION: ['Needs your approval', 'You must explicitly approve this payment on PayPal.'],
    BLOCK: ['Blocked by your policy', 'The server will refuse this cart before PayPal is contacted.']
  };
  function renderPolicy(p) {
    var box = $('policy'); box.textContent = '';
    var L = p.limits; var max = L.maxPerPurchaseMinor; var wrap = el('div', 'pbox' + (p.decision ? ' ' + p.decision : ''));
    var head = el('div', 'phead');
    head.appendChild(el('b', '', p.decision ? DECISION_TEXT[p.decision][0] : 'Your policy limits'));
    head.appendChild(el('span', 'pill', 'enforced by server'));
    wrap.appendChild(head);
    var meter = el('div', 'meter'); meter.setAttribute('role', 'img');
    var total = p.empty ? 0 : p.totalMinor;
    meter.setAttribute('aria-label', 'Cart ' + eur(total) + ' of ' + eur(max) + ' maximum; approval above ' + eur(L.confirmationThresholdMinor));
    var fill = el('i', 'fill'); fill.style.width = Math.min(100, total / max * 100) + '%'; meter.appendChild(fill);
    var mark = el('i', 'mark'); mark.style.left = (L.confirmationThresholdMinor / max * 100) + '%'; meter.appendChild(mark);
    wrap.appendChild(meter);
    var scale = el('div', 'scale'); scale.appendChild(el('span', '', eur(0)));
    var thr = el('span', '', 'approval above ' + eur(L.confirmationThresholdMinor)); scale.appendChild(thr);
    scale.appendChild(el('span', '', 'max ' + eur(max))); wrap.appendChild(scale);
    if (p.decision) {
      wrap.appendChild(el('div', 'mut', p.decision === 'BLOCK' && p.reason ? p.reason + '. ' + DECISION_TEXT.BLOCK[1] : DECISION_TEXT[p.decision][1]));
      var ul = el('ul', 'checks');
      p.checks.forEach(function (c) {
        var li = el('li', c.status); li.appendChild(el('span', 'ic', c.status === 'pass' ? '✓' : c.status === 'confirm' ? '!' : '✕'));
        var t = el('span', ''); t.appendChild(el('b', '', c.label + ': ')); t.appendChild(document.createTextNode(c.detail)); li.appendChild(t); ul.appendChild(li);
      });
      wrap.appendChild(ul);
    } else {
      wrap.appendChild(el('div', 'mut', 'Daily budget ' + eur(L.dailySpendLimitMinor) + ' (' + eur(L.dailyRemainingMinor) + ' left). Add items to see the live policy decision.'));
    }
    box.appendChild(wrap);
  }

  // ---- Catalog ------------------------------------------------------------------------------
  function renderCatalog(list) {
    allProducts = list; list.forEach(function (p) { catalog[p.id] = p; });
    var cats = ['all'].concat(list.map(function (p) { return p.category; }).filter(function (c, i, a) { return a.indexOf(c) === i; }));
    var bar = $('cats'); bar.textContent = '';
    cats.forEach(function (c) {
      var b = el('button', c === activeCat ? 'on' : '', c === 'all' ? 'All' : c.charAt(0).toUpperCase() + c.slice(1)); b.type = 'button';
      b.setAttribute('aria-pressed', c === activeCat ? 'true' : 'false');
      b.onclick = function () { activeCat = c; renderCatalog(allProducts); }; bar.appendChild(b);
    });
    var box = $('catalog'); box.textContent = '';
    list.filter(function (p) { return activeCat === 'all' || p.category === activeCat; }).forEach(function (p) {
      var card = el('div', 'prod'); card.appendChild(el('span', 'emo', CATEGORY_EMOJI[p.category] || '🛒')); card.appendChild(el('b', '', p.name)); card.appendChild(el('small', '', p.description));
      var tags = el('div', 'tags'); p.dietary.forEach(function (d) { tags.appendChild(el('span', 'tag' + (d === 'alcohol' ? ' warn' : ''), d)); }); card.appendChild(tags);
      var row = el('div', 'row'); row.appendChild(el('span', '', eur(p.priceMinor)));
      var add = el('button', '', 'Add'); add.onclick = function () { setQty(p.id, (cart[p.id] || 0) + 1); };
      row.appendChild(add); card.appendChild(row); box.appendChild(card);
    });
  }

  // One-click, repeatable scenarios. They only fill the cart: the decision shown always comes from the server.
  var SCENARIOS = [
    { t: 'Everyday order', hint: 'EUR 13 → needs approval', items: { veg_breakfast: 1, coffee: 1 } },
    { t: 'Quick coffee', hint: 'EUR 3 → auto-allowed', items: { coffee: 1 } },
    { t: 'Over the limit', hint: 'EUR 55 → blocked', items: { veg_breakfast: 1, premium_cake: 1 } },
    { t: 'Team order', hint: 'EUR 38 → blocked', items: { office_pastry_box: 1 } },
    { t: 'Alcohol request', hint: 'blocked by rule', items: { mulled_wine: 1 } }
  ];
  function renderScenarios() {
    var box = $('scenarios'); box.textContent = '';
    SCENARIOS.forEach(function (sc) {
      if (!Object.keys(sc.items).every(function (id) { return catalog[id]; })) return;
      var b = el('button', 'scn'); b.type = 'button'; b.appendChild(el('b', '', sc.t)); b.appendChild(el('small', 'mut', sc.hint));
      b.onclick = function () { cart = Object.assign({}, sc.items); save(CKEY, cart); renderCart(); };
      box.appendChild(b);
    });
  }

  // ---- Chat ---------------------------------------------------------------------------------
  function prefs() {
    var out = { dietary: [] }; var d = $('diet').value; if (d) out.dietary.push(d);
    var b = parseFloat($('budget').value);
    if (isFinite(b) && b >= 1 && b <= 100) out.maxBudgetMinor = Math.round(b * 100);
    return out;
  }
  function ask(text) {
    if (busy || !text.trim()) return;
    busy = true; $('send').disabled = true; say('u', text); $('msg').value = ''; say('s', 'Agent is searching the menu…');
    var thinking = $('log').lastChild;
    api('/api/ai/chat', { method: 'POST', body: JSON.stringify({ message: text, preferences: prefs() }) }).then(function (r) {
      thinking.remove(); say('a', r.response || '(no answer)');
      if (r.mode === 'rule-based') { say('s', 'Rule-based planner (no AI) \u2014 the cart below is still priced and checked by the server.'); }
      if (r.preparedCart && r.preparedCart.items) {
        cart = {}; r.preparedCart.items.forEach(function (i) { cart[i.productId] = i.quantity; });
        save(CKEY, cart); showPolicy(r.preparedCart);
      }
    }).catch(function (e) {
      thinking.remove(); say('s', e.status === 503 ? (e.body && e.body.details && e.body.details.code === 'AI_UNAVAILABLE' ? 'The AI is at capacity right now. Try again in a minute, or use the menu.' : 'The AI is not configured on this server (no AI provider key). You can still use the menu.') : 'Error: ' + e.message);
    }).then(function () { busy = false; $('send').disabled = false; renderCart(); });
  }

  // ---- Checkout -----------------------------------------------------------------------------
  function uuid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2); }
  function pay() {
    var items = Object.keys(cart).map(function (id) { return { productId: id, quantity: cart[id] }; });
    if (!items.length) return;
    busy = true; renderCart();
    var pbtn = $('pay'); pbtn.classList.add('loading'); pbtn.setAttribute('aria-busy', 'true'); pbtn.textContent = 'Contacting PayPal…';
    api('/api/orders/create', { method: 'POST', headers: { 'Idempotency-Key': uuid() }, body: JSON.stringify({ items: items }) }).then(function (o) {
      if (!o.approvalUrl) throw new Error('PayPal did not return an approval link');
      save(PKEY, { orderId: o.orderId, paypalOrderId: o.paypalOrderId, total: o.totalFormatted });
      window.location.assign(o.approvalUrl);
    }).catch(function (e) {
      busy = false; pbtn.classList.remove('loading'); pbtn.removeAttribute('aria-busy'); renderCart();
      if (e.status === 403) { showPolicy({ policyDecision: 'BLOCK', reason: (e.body && (e.body.reason || e.body.suggestion)) || e.message }); }
      banner('bad', e.status === 503 ? 'PayPal is not configured on this server.' : 'Checkout failed: ' + e.message);
    });
  }
  function handleReturn() {
    var q = new URLSearchParams(location.search); var st = q.get('paypal'); if (!st) return;
    history.replaceState(null, '', '/');
    var pend = load(PKEY);
    if (st === 'cancel') { drop(PKEY); banner('bad', 'Checkout cancelled. Nothing was charged.'); return; }
    if (!pend || pend.paypalOrderId !== q.get('token')) { banner('bad', 'This PayPal return does not match an order from this browser, so nothing was captured.'); return; }
    var b = $('banner'); b.hidden = false; b.textContent = '';
    var box = el('div', 'ok'); box.appendChild(el('div', '', 'PayPal approved your ' + pend.total + ' order. Confirm to complete the payment.'));
    var go = el('button', 'primary', 'Confirm payment'); go.style.marginTop = '8px';
    go.onclick = function () {
      go.disabled = true; go.classList.add('loading'); go.setAttribute('aria-busy', 'true'); go.textContent = 'Capturing…';
      api('/api/orders/' + encodeURIComponent(pend.orderId) + '/capture', { method: 'POST', body: '{}' }).then(function (r) {
        var items = Object.keys(cart).map(function (id) { var p = catalog[id]; return { name: p.name, qty: cart[id], price: eur(p.priceMinor) }; });
        var decision = (policy && policy.decision) ? policy.decision : 'AUTO_ALLOW';
        go.classList.remove('loading'); go.removeAttribute('aria-busy');
        drop(PKEY); cart = {}; save(CKEY, cart); renderCart();
        renderReceipt({ items: items, totalText: pend.total, maskedId: maskId(r.paypalCaptureId), decision: decision, status: r.status || 'COMPLETED' });
      }).catch(function (e) { go.disabled = false; go.classList.remove('loading'); go.removeAttribute('aria-busy'); go.textContent = 'Confirm payment'; banner('bad', 'Capture failed: ' + e.message); });
    };
    box.appendChild(go); b.appendChild(box);
  }

  // ---- Receipt + demo reset ------------------------------------------------------------------
  function maskId(id) {
    if (!id) return '—';
    if (id.length <= 8) return id;
    return id.slice(0, 4) + '••••' + id.slice(-4);
  }
  function decisionLabel(d) {
    if (d === 'REQUIRE_CONFIRMATION') return 'needed your approval';
    if (d === 'BLOCK') return 'blocked';
    return 'auto-allowed';
  }
  // Hide the cart chrome while a receipt is on screen (and restore it on reset).
  function setCartChrome(v) {
    ['cart', 'policy', 'policy-note', 'cartTotal', 'pay', 'payNote'].forEach(function (id) { var n = $(id); if (n) n.hidden = !v; });
  }
  function renderReceipt(d) {
    var box = $('receipt'); box.textContent = ''; box.hidden = false;
    box.appendChild(el('h3', '', 'Payment receipt'));
    box.appendChild(el('p', 'mut', 'Status: ' + (d.status || 'COMPLETED')));
    if (d.items && d.items.length) {
      var ul = el('ul', 'ritems');
      d.items.forEach(function (it) {
        var li = el('li', ''); li.appendChild(el('span', '', it.qty + '× ' + it.name)); li.appendChild(el('span', '', it.price));
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }
    box.appendChild(el('div', 'rtotal', 'Total paid: ' + d.totalText));
    box.appendChild(el('div', 'rmask', 'PayPal capture ID: ' + d.maskedId));
    var steps = ['Cart prepared', 'Policy decision — ' + decisionLabel(d.decision), 'Approved at PayPal', 'Captured'];
    var ol = el('ol', 'rsteps');
    steps.forEach(function (t) { var li = el('li', 'step'); li.appendChild(el('span', 'ic', '✓')); li.appendChild(el('span', '', t)); ol.appendChild(li); });
    box.appendChild(ol);
    var link = el('a', 'rlink', 'Open the Agent Control Center'); link.href = '/dashboard.html'; link.setAttribute('rel', 'noopener');
    box.appendChild(link);
    setCartChrome(false);
  }
  function reset() {
    cart = {}; save(CKEY, cart); drop(PKEY);
    var r = $('receipt'); if (r) { r.textContent = ''; r.hidden = true; }
    var b = $('banner'); if (b) { b.hidden = true; b.textContent = ''; }
    policy = null; $('policy').textContent = ''; $('policy-note').textContent = '';
    setCartChrome(true); renderCart();
    say('s', 'Demo reset — cart and pending order cleared.');
  }
  // Exposed for headless verification only; not used by the normal flow.
  window.AICAFE = window.AICAFE || {}; window.AICAFE.renderReceipt = renderReceipt; window.AICAFE.reset = reset;

  // ---- Boot ---------------------------------------------------------------------------------
  function boot() {
    session = load(SKEY); cart = load(CKEY) || {};
    ['Vegetarian breakfast for two under €20', 'A birthday treat for a friend', 'Coffee and a snack, max €10'].forEach(function (t) {
      var b = el('button', '', t); b.type = 'button'; b.onclick = function () { ask(t); }; $('chips').appendChild(b);
    });
    $('chat-form').addEventListener('submit', function (e) { e.preventDefault(); ask($('msg').value); });
    $('pay').addEventListener('click', pay);
    $('reset').addEventListener('click', reset);
    say('a', 'Hi! Tell me what you need and what you want to spend. I prepare the cart; you approve the payment.');
    fetch('/api/health').then(function (r) { return r.json(); }).then(function (h) {
      var a = $('b-ai'), p = $('b-pp');
      a.textContent = h.ai && h.ai.enabled ? 'AI ready' : 'AI not configured'; a.className = 'pill ' + (h.ai && h.ai.enabled ? 'on' : 'off');
      p.textContent = h.paypal && h.paypal.enabled ? 'PayPal ' + h.paypal.environment : 'PayPal not configured'; p.className = 'pill ' + (h.paypal && h.paypal.enabled ? 'on' : 'off');
    }).catch(function () { /* badges stay neutral */ });
    fetch('/api/catalog').then(function (r) { return r.json(); }).then(function (c) { renderCatalog(c.products || []); renderScenarios(); renderCart(); handleReturn(); })
      .catch(function () { banner('bad', 'Could not load the menu. Is the API running?'); });
    renderCart();
    if (!session) newSession().catch(function () { /* retried on first request */ });
  }
  boot();
})();
