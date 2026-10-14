(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var SKEY = 'aicafe.session', PKEY = 'aicafe.pending', CKEY = 'aicafe.cart';
  var catalog = {}, cart = {}, session = null, busy = false;

  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  function drop(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  function eur(minor) { return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(minor / 100); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }

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
    $('pay').disabled = busy || !ids.length;
  }
  function showPolicy(c) {
    var box = $('policy'); box.textContent = '';
    if (!c || !c.policyDecision) return;
    var labels = { AUTO_ALLOW: 'Policy: within your limits', REQUIRE_CONFIRMATION: 'Policy: needs your explicit approval', BLOCK: 'Policy: blocked' };
    var d = el('div', 'policy ' + c.policyDecision, labels[c.policyDecision] || c.policyDecision);
    if (c.reason) d.appendChild(el('div', 'mut', c.reason));
    box.appendChild(d);
  }

  // ---- Catalog ------------------------------------------------------------------------------
  function renderCatalog(list) {
    var box = $('catalog'); box.textContent = '';
    list.forEach(function (p) {
      catalog[p.id] = p;
      var card = el('div', 'prod'); card.appendChild(el('b', '', p.name)); card.appendChild(el('small', '', p.description));
      var row = el('div', 'row'); row.appendChild(el('span', '', eur(p.priceMinor)));
      var add = el('button', '', 'Add'); add.onclick = function () { setQty(p.id, (cart[p.id] || 0) + 1); };
      row.appendChild(add); card.appendChild(row); box.appendChild(card);
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
      if (r.preparedCart && r.preparedCart.items) {
        cart = {}; r.preparedCart.items.forEach(function (i) { cart[i.productId] = i.quantity; });
        save(CKEY, cart); showPolicy(r.preparedCart);
      }
    }).catch(function (e) {
      thinking.remove(); say('s', e.status === 503 ? 'The AI is not configured on this server (OPENAI_API_KEY missing). You can still use the menu.' : 'Error: ' + e.message);
    }).then(function () { busy = false; $('send').disabled = false; renderCart(); });
  }

  // ---- Checkout -----------------------------------------------------------------------------
  function uuid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2); }
  function pay() {
    var items = Object.keys(cart).map(function (id) { return { productId: id, quantity: cart[id] }; });
    if (!items.length) return;
    busy = true; renderCart(); $('pay').textContent = 'Contacting PayPal…';
    api('/api/orders/create', { method: 'POST', headers: { 'Idempotency-Key': uuid() }, body: JSON.stringify({ items: items }) }).then(function (o) {
      if (!o.approvalUrl) throw new Error('PayPal did not return an approval link');
      save(PKEY, { orderId: o.orderId, paypalOrderId: o.paypalOrderId, total: o.totalFormatted });
      window.location.assign(o.approvalUrl);
    }).catch(function (e) {
      busy = false; $('pay').textContent = 'Review & pay with PayPal'; renderCart();
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
      go.disabled = true; go.textContent = 'Capturing…';
      api('/api/orders/' + encodeURIComponent(pend.orderId) + '/capture', { method: 'POST', body: '{}' }).then(function (r) {
        drop(PKEY); cart = {}; save(CKEY, cart); renderCart();
        banner('ok', 'Payment ' + r.status + '. PayPal capture ' + (r.paypalCaptureId || '') + '. See it live in the Agent Control Center.');
      }).catch(function (e) { go.disabled = false; go.textContent = 'Confirm payment'; banner('bad', 'Capture failed: ' + e.message); });
    };
    box.appendChild(go); b.appendChild(box);
  }

  // ---- Boot ---------------------------------------------------------------------------------
  function boot() {
    session = load(SKEY); cart = load(CKEY) || {};
    ['Vegetarian breakfast for two under €20', 'A birthday treat for a friend', 'Coffee and a snack, max €10'].forEach(function (t) {
      var b = el('button', '', t); b.type = 'button'; b.onclick = function () { ask(t); }; $('chips').appendChild(b);
    });
    $('chat-form').addEventListener('submit', function (e) { e.preventDefault(); ask($('msg').value); });
    $('pay').addEventListener('click', pay);
    say('a', 'Hi! Tell me what you need and what you want to spend. I prepare the cart; you approve the payment.');
    fetch('/api/health').then(function (r) { return r.json(); }).then(function (h) {
      var a = $('b-ai'), p = $('b-pp');
      a.textContent = h.ai && h.ai.enabled ? 'AI ready' : 'AI not configured'; a.className = 'pill ' + (h.ai && h.ai.enabled ? 'on' : 'off');
      p.textContent = h.paypal && h.paypal.enabled ? 'PayPal ' + h.paypal.environment : 'PayPal not configured'; p.className = 'pill ' + (h.paypal && h.paypal.enabled ? 'on' : 'off');
    }).catch(function () { /* badges stay neutral */ });
    fetch('/api/catalog').then(function (r) { return r.json(); }).then(function (c) { renderCatalog(c.products || []); renderCart(); handleReturn(); })
      .catch(function () { banner('bad', 'Could not load the menu. Is the API running?'); });
    renderCart();
    if (!session) newSession().catch(function () { /* retried on first request */ });
  }
  boot();
})();
