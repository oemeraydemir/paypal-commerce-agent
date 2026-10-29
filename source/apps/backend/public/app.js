(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var SKEY = 'aicafe.session', PKEY = 'aicafe.pending', CKEY = 'aicafe.cart', AKEY = 'aicafe.allergens', OKEY = 'aicafe.onboarded';
  var catalog = {}, cart = {}, session = null, busy = false;
  var policy = null, pseq = 0, ptimer = null, activeCat = 'all', allProducts = [];
  var lastPrepared = null, lastHealth = null;
  var quickReplyGeneration = 0;

  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  function drop(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  // Currency formatting follows the active locale via i18n; falls back to en-IE.
  function eurFallback(minor) { return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(minor / 100); }
  function eur(minor) { return (window.i18n && window.i18n.formatMoney) ? window.i18n.formatMoney(minor) : eurFallback(minor); }
  function i18nT(k) { return (window.i18n && window.i18n.t) ? window.i18n.t(k) : k; }
  function fmtDate(d) { return (window.i18n && window.i18n.formatDate) ? window.i18n.formatDate(d) : d.toLocaleString(); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }

  // Display-only parsing; keep in parity with src/ai/quick-replies.ts.
  function extractQuickReplies(raw) {
    var options = [], table = false, list = false, fence = '', invalid = false;
    function clean(s) { return s.replace(/[\uFE0F\u20E3]/g, '').replace(/\*\*|__/g, '').trim(); }
    function cells(s) {
      var parts = s.split('|').map(function (part) { return part.trim(); });
      if (parts[0] === '') parts.shift();
      if (parts[parts.length - 1] === '') parts.pop();
      return parts;
    }
    function add(first, fallback) {
      var match = /^(?:(?:option|seçenek)\s*)?(\d+)(?:\s*[.)\]:-]\s*|\s+|$)(.*)$/i.exec(clean(first));
      if (!match) { invalid = true; return; }
      var label = clean(match[2] || fallback || '').replace(/\s+/g, ' ');
      if (!label || Number(match[1]) !== options.length + 1 || options.length >= 4) {
        invalid = true; return;
      }
      options.push({ id: match[1], label: label.slice(0, 80) });
    }
    raw.replace(/\r\n?/g, '\n').split('\n').forEach(function (source) {
      var line = source.trim();
      var marker = /^(?:`{3,}|~{3,})/.exec(line);
      if (marker) {
        if (!fence) fence = marker[0][0];
        else if (fence === marker[0][0]) fence = '';
        return;
      }
      if (fence) return;
      var parts = cells(line);
      if (parts.length >= 2 && /^(?:options?|seçenek(?:ler)?)$/i.test(clean(parts[0]))) {
        table = true; list = false; return;
      }
      if (table && parts.length >= 2) {
        if (parts.every(function (part) { return /^:?-{3,}:?$/.test(part); })) return;
        add(parts[0], parts[1]); return;
      }
      table = false;
      if (/^(?:#{1,6}\s*)?(?:options?|seçenek(?:ler)?)\s*:?$/i.test(clean(line))) {
        list = true; return;
      }
      var candidate = clean(line).replace(/^[-*•]\s+/, '');
      var explicit = /^(?:option|seçenek)\s*\d/i.test(candidate) || /^\d\uFE0F?\u20E3/.test(line.replace(/^(?:[-*•]\s+|\*\*)/, ''));
      if (explicit || (list && /^\d+[.)]\s+/.test(candidate))) add(candidate);
      else if (line) list = false;
    });
    return !invalid && options.length >= 2 ? options : [];
  }
  function refreshQuickReplies() {
    $('log').querySelectorAll('.quick-reply').forEach(function (button) {
      button.disabled = busy || Number(button.getAttribute('data-generation')) !== quickReplyGeneration;
      button.setAttribute('aria-label', i18nT('options.select') + ' ' + button.getAttribute('data-option-id') + ': ' + button.getAttribute('data-option-label'));
    });
    $('log').querySelectorAll('.quick-reply-hint').forEach(function (hint) {
      hint.textContent = i18nT('options.hint');
    });
  }
  function addQuickReplies(bubble, text) {
    var options = extractQuickReplies(text);
    if (!options.length) return;
    var generation = quickReplyGeneration;
    bubble.appendChild(el('p', 'quick-reply-hint', i18nT('options.hint')));
    var group = el('div', 'chips quick-replies');
    group.setAttribute('role', 'group');
    options.forEach(function (option) {
      var button = el('button', 'quick-reply', option.id + '. ' + option.label);
      button.type = 'button';
      button.setAttribute('data-generation', String(generation));
      button.setAttribute('data-option-id', option.id);
      button.setAttribute('data-option-label', option.label);
      button.onclick = function () {
        if (busy || generation !== quickReplyGeneration) return;
        ask(option.id);
      };
      group.appendChild(button);
    });
    bubble.appendChild(group);
  }

  // Server decision enum -> i18n key fragment (kept in sync with i18n.js keys).
  var DEC_KEY = { AUTO_ALLOW: 'autoAllow', REQUIRE_CONFIRMATION: 'confirm', BLOCK: 'block' };

  function decShort(d) { return i18nT('decision.' + (DEC_KEY[d] || 'autoAllow') + '.short'); }
  function decLong(d) { return i18nT('decision.' + (DEC_KEY[d] || 'autoAllow') + '.long'); }

  // Category emoji for product cards (unicode only — no external images).
  var CATEGORY_EMOJI = {
    breakfast: '🥐', drinks: '🥤', desserts: '🍰', gifts: '🎁',
    lunch: '🥪', snacks: '🍪', catering: '🍱'
  };

  function banner(kind, text) {
    var b = $('banner'); b.hidden = false; b.textContent = '';
    var d = el('div', kind, text); b.appendChild(d);
  }
  // Coco barista avatar, reused by the header badge and by assistant messages.
  // Built with createElementNS so it stays CSP-safe and never parses a string into markup.
  function buildCocoSvg() {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '22');
    svg.setAttribute('height', '22');
    svg.setAttribute('aria-hidden', 'true');
    var g = document.createElementNS(NS, 'g');
    g.setAttribute('fill', 'none');
    g.setAttribute('stroke', 'var(--brand)');
    g.setAttribute('stroke-width', '1.7');
    g.setAttribute('stroke-linecap', 'round');
    g.setAttribute('stroke-linejoin', 'round');
    ['M5 9h11v4a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z',
      'M16 10h2.6a2.4 2.4 0 0 1 0 4.8H16',
      'M8 3.4c0 .9-.7 1.3-.7 2.2M11 3.4c0 .9-.7 1.3-.7 2.2'
    ].forEach(function (d) {
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      g.appendChild(p);
    });
    svg.appendChild(g);
    return svg;
  }
  // ---- Safe Markdown rendering for assistant messages -------------------------
  // The AI may return markdown-ish prose (**bold**, *italic*, `code`, links,
  // bullet/numbered lists). We render a conservative subset using only DOM APIs
  // (createElement/createTextNode), so no raw user-provided markup is ever parsed
  // into live content. Links are restricted to http(s) and get rel=noopener.
  function addInlineText(parent, text) {
    var re = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
    var last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      if (m[1] !== undefined) {
        var b = document.createElement('strong'); b.textContent = m[1]; parent.appendChild(b);
      } else if (m[2] !== undefined) {
        var em = document.createElement('em'); em.textContent = m[2]; parent.appendChild(em);
      } else if (m[3] !== undefined) {
        var c = document.createElement('code'); c.textContent = m[3]; parent.appendChild(c);
      } else if (m[4] !== undefined) {
        var href = m[5].trim();
        if (/^https?:\/\//i.test(href)) {
          var a = document.createElement('a');
          a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
          a.textContent = m[4]; parent.appendChild(a);
        } else {
          parent.appendChild(document.createTextNode(m[4]));
        }
      }
      last = re.lastIndex;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }
  // Markdown tables are shown as cards (one per row), not as a spreadsheet-like grid.
  function splitTableRow(line) {
    var t = line.trim();
    if (t.charAt(0) === '|') t = t.slice(1);
    if (t.charAt(t.length - 1) === '|') t = t.slice(0, -1);
    return t.split('|').map(function (c) { return c.trim(); });
  }
  function isTableSeparator(cells) {
    return cells.length > 0 && cells.every(function (c) { return /^:?-{3,}:?$/.test(c); });
  }
  function renderTableCards(container, header, rows) {
    var wrap = document.createElement('div'); wrap.className = 'cards';
    rows.forEach(function (cells) {
      var card = document.createElement('div'); card.className = 'card';
      var title = document.createElement('div'); title.className = 'card-t';
      addInlineText(title, cells[0] || ''); card.appendChild(title);
      for (var k = 1; k < cells.length; k++) {
        if (!cells[k]) continue;
        var kv = document.createElement('div'); kv.className = 'kv';
        var key = document.createElement('span'); key.className = 'k'; key.textContent = header[k] || '';
        var val = document.createElement('span'); val.className = 'v'; addInlineText(val, cells[k]);
        kv.appendChild(key); kv.appendChild(val); card.appendChild(kv);
      }
      wrap.appendChild(card);
    });
    container.appendChild(wrap);
  }
  function renderMarkdown(container, raw) {
    container.textContent = '';
    if (!raw) return;
    var lines = String(raw).replace(/\r\n?/g, '\n').split('\n');
    var i = 0, n = lines.length;
    while (i < n) {
      var trimmed = lines[i].trim();
      if (trimmed === '') { i++; continue; }
      if (trimmed.charAt(0) === '|') {
        var trows = [], tj = i;
        while (tj < n && lines[tj].trim().charAt(0) === '|') { trows.push(splitTableRow(lines[tj])); tj++; }
        if (trows.length >= 3 && isTableSeparator(trows[1])) {
          renderTableCards(container, trows[0], trows.slice(2));
          i = tj; continue;
        }
      }
      var ulMatch = /^[-*•]\s+/.exec(trimmed);
      var olMatch = /^\d+[.)]\s+/.exec(trimmed);
      if (ulMatch || olMatch) {
        var tag = ulMatch ? 'ul' : 'ol';
        var list = document.createElement(tag);
        while (i < n) {
          var l = lines[i].trim();
          var mu = /^[-*•]\s+(.*)$/.exec(l);
          var mo = /^\d+[.)]\s+(.*)$/.exec(l);
          if (!mu && !mo) break;
          if (!!mu !== !!ulMatch) break;
          var li = document.createElement('li');
          addInlineText(li, (mu ? mu[1] : mo[1]));
          list.appendChild(li);
          i++;
        }
        container.appendChild(list);
        continue;
      }
      var hMatch = /^(#{1,4})\s+(.*)$/.exec(trimmed);
      if (hMatch) {
        var ht = document.createElement('h' + Math.min(hMatch[1].length, 6));
        addInlineText(ht, hMatch[2]);
        container.appendChild(ht);
        i++;
        continue;
      }
      var p = document.createElement('p');
      var first = true;
      while (i < n) {
        var tl = lines[i].trim();
        if (tl === '') break;
        if (/^[-*•]\s+/.test(tl) || /^\d+[.)]\s+/.test(tl)) break;
        if (/^#{1,4}\s+/.test(tl)) break;
        if (!first) p.appendChild(document.createElement('br'));
        addInlineText(p, tl);
        first = false; i++;
      }
      container.appendChild(p);
    }
  }
  function say(role, text) {
    var log = $('log');
    var m;
    if (role === 'a') {
      // Assistant messages get a visible Coco avatar on the left.
      m = el('div', 'msg a');
      var av = el('span', 'aval'); av.appendChild(buildCocoSvg()); av.title = 'Coco';
      m.appendChild(av);
      var bub = el('div', 'bub'); renderMarkdown(bub, text); addQuickReplies(bub, text); m.appendChild(bub);
    } else {
      m = el('div', 'msg ' + role, text);
    }
    log.appendChild(m); refreshQuickReplies(); log.scrollTop = log.scrollHeight;
  }

  // ---- API with server-issued session ------------------------------------------------------
  function newSession() {
    return fetch('/api/sessions', { method: 'POST' }).then(function (r) {
      if (!r.ok) throw new Error('Could not start a session (' + r.status + ')');
      return r.json();
    }).then(function (s) { session = { id: s.sessionId, token: s.sessionToken }; save(SKEY, session); return session; });
  }

  // Single-flight session creation. Protected requests await this before going
  // out, so a page load never sends an authenticated request before a session
  // exists (the previous code did, producing avoidable 401s and duplicate
  // session creations on startup). Server-side validation is unchanged.
  var sessionPromise = null;
  function ensureSession() {
    if (session) return Promise.resolve(session);
    if (!sessionPromise) {
      sessionPromise = newSession().finally(function () { sessionPromise = null; });
    }
    return sessionPromise;
  }

  function api(path, opts, retried) {
    opts = opts || {};
    var headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    var send = function (tried) {
      if (session) {
        headers['X-Session-Id'] = session.id;
        headers['Authorization'] = 'Bearer ' + session.token;
      }
      return fetch(path, Object.assign({}, opts, { headers: headers })).then(function (r) {
        if (r.status === 401 && !tried && opts.auth !== false) {
          return ensureSession().then(function () { return send(true); });
        }
        return r.json().catch(function () { return {}; }).then(function (body) {
          if (!r.ok) { var e = new Error(body.message || body.error || ('Request failed (' + r.status + ')')); e.body = body; e.status = r.status; throw e; }
          return body;
        });
      });
    };
    // Requests that opt out of auth (auth:false) go out as-is without a session.
    if (opts.auth === false) return send(!!retried);
    return ensureSession().then(function () { return send(!!retried); });
  }

  // ---- Cart ---------------------------------------------------------------------------------
  function cartTotal() { return Object.keys(cart).reduce(function (s, id) { return s + (catalog[id] ? catalog[id].priceMinor * cart[id] : 0); }, 0); }
  function setQty(id, q) { if (q <= 0) delete cart[id]; else cart[id] = Math.min(q, 99); save(CKEY, cart); renderCart(); }
  function renderCart() {
    var box = $('cart'); box.textContent = '';
    var ids = Object.keys(cart);
    if (!ids.length) box.appendChild(el('p', 'mut', i18nT('cart.empty')));
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
    if (!busy) $('pay').textContent = blocked ? i18nT('pay.blocked') : i18nT('pay.review');
  }
  function showPolicy(c) {
    var box = $('policy-note'); box.textContent = '';
    if (!c || !c.policyDecision) return;
    var d = el('div', 'policy ' + c.policyDecision, decShort(c.policyDecision));
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
  function renderPolicy(p) {
    var box = $('policy'); box.textContent = '';
    var L = p.limits; var max = L.maxPerPurchaseMinor; var wrap = el('div', 'pbox' + (p.decision ? ' ' + p.decision : ''));
    var head = el('div', 'phead');
    head.appendChild(el('b', '', p.decision ? decShort(p.decision) : i18nT('policy.limits')));
    head.appendChild(el('span', 'pill', i18nT('policy.enforced')));
    wrap.appendChild(head);
    var meter = el('div', 'meter'); meter.setAttribute('role', 'img');
    var total = p.empty ? 0 : p.totalMinor;
    meter.setAttribute('aria-label', 'Cart ' + eur(total) + ' of ' + eur(max) + ' maximum; ' + i18nT('policy.approvalAbove') + ' ' + eur(L.confirmationThresholdMinor));
    var fill = el('i', 'fill'); fill.style.width = Math.min(100, total / max * 100) + '%'; meter.appendChild(fill);
    var mark = el('i', 'mark'); mark.style.left = (L.confirmationThresholdMinor / max * 100) + '%'; meter.appendChild(mark);
    wrap.appendChild(meter);
    var scale = el('div', 'scale'); scale.appendChild(el('span', '', eur(0)));
    var thr = el('span', '', i18nT('policy.approvalAbove') + ' ' + eur(L.confirmationThresholdMinor)); scale.appendChild(thr);
    scale.appendChild(el('span', '', i18nT('policy.max') + ' ' + eur(max))); wrap.appendChild(scale);
    if (p.decision) {
      wrap.appendChild(el('div', 'mut', p.decision === 'BLOCK' && p.reason ? p.reason + '. ' + decLong('BLOCK') : decLong(p.decision)));
      var ul = el('ul', 'checks');
      p.checks.forEach(function (c) {
        var li = el('li', c.status); li.appendChild(el('span', 'ic', c.status === 'pass' ? '✓' : c.status === 'confirm' ? '!' : '✕'));
        var t = el('span', ''); t.appendChild(el('b', '', c.label + ': ')); t.appendChild(document.createTextNode(c.detail)); li.appendChild(t); ul.appendChild(li);
      });
      wrap.appendChild(ul);
    } else {
      wrap.appendChild(el('div', 'mut', i18nT('policy.dailyBudget') + eur(L.dailySpendLimitMinor) + ' (' + eur(L.dailyRemainingMinor) + i18nT('policy.dailyLeft')));
    }
    box.appendChild(wrap);
  }

  // ---- Catalog ------------------------------------------------------------------------------
  function renderCatalog(list) {
    allProducts = list; list.forEach(function (p) { catalog[p.id] = p; });
    var cats = ['all'].concat(list.map(function (p) { return p.category; }).filter(function (c, i, a) { return a.indexOf(c) === i; }));
    var bar = $('cats'); bar.textContent = '';
    cats.forEach(function (c) {
      var b = el('button', c === activeCat ? 'on' : '', c === 'all' ? i18nT('category.all') : c.charAt(0).toUpperCase() + c.slice(1)); b.type = 'button';
      b.setAttribute('aria-pressed', c === activeCat ? 'true' : 'false');
      b.onclick = function () { activeCat = c; renderCatalog(allProducts); }; bar.appendChild(b);
    });
    var box = $('catalog'); box.textContent = '';
    list.filter(function (p) { return activeCat === 'all' || p.category === activeCat; }).forEach(function (p) {
      var card = el('div', 'prod'); card.appendChild(el('span', 'emo', CATEGORY_EMOJI[p.category] || '🛒')); card.appendChild(el('b', '', p.name)); card.appendChild(el('small', '', p.description));
      var tags = el('div', 'tags'); p.dietary.forEach(function (d) { tags.appendChild(el('span', 'tag' + (d === 'alcohol' ? ' warn' : ''), d)); }); card.appendChild(tags);
      var row = el('div', 'row'); row.appendChild(el('span', '', eur(p.priceMinor)));
      var add = el('button', '', i18nT('add')); add.onclick = function () { setQty(p.id, (cart[p.id] || 0) + 1); };
      row.appendChild(add); card.appendChild(row); box.appendChild(card);
    });
  }

  // One-click, repeatable scenarios. They only fill the cart: the decision shown always comes from the server.
  var SCENARIOS = [
    { key: 'scenario.everyday', hint: 'hint.needsApproval', items: { veg_breakfast: 1, coffee: 1 } },
    { key: 'scenario.quick', hint: 'hint.autoAllowed', items: { coffee: 1 } },
    { key: 'scenario.overLimit', hint: 'hint.blocked', items: { veg_breakfast: 1, premium_cake: 1 } },
    { key: 'scenario.team', hint: 'hint.blocked', items: { office_pastry_box: 1 } },
    { key: 'scenario.alcohol', hint: 'hint.blockedRule', items: { mulled_wine: 1 } }
  ];
  function renderScenarios() {
    var box = $('scenarios'); box.textContent = '';
    SCENARIOS.forEach(function (sc) {
      if (!Object.keys(sc.items).every(function (id) { return catalog[id]; })) return;
      var total = Object.keys(sc.items).reduce(function (s, id) { return s + catalog[id].priceMinor * sc.items[id]; }, 0);
      var b = el('button', 'scn'); b.type = 'button'; b.appendChild(el('b', '', i18nT(sc.key))); b.appendChild(el('small', 'mut', eur(total) + ' · ' + i18nT(sc.hint)));
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
  function renderProfileStatus() {
    var status = $('profile-status'); if (!status) return;
    var current = prefs(); var parts = [];
    current.dietary.forEach(function (diet) { parts.push(i18nT('diet.' + diet)); });
    if (current.maxBudgetMinor !== undefined) {
      try {
        var locale = (window.i18n && window.i18n.lang === 'tr') ? 'tr-TR' : 'en-IE';
        parts.push(new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(current.maxBudgetMinor / 100));
      } catch (e) { parts.push('€' + (current.maxBudgetMinor / 100).toFixed(2)); }
    }
    status.textContent = parts.length ? i18nT('profile.applied') + ' ' + parts.join(' · ') : i18nT('profile.none');
  }
  function onProfileChange() {
    quickReplyGeneration++;
    renderProfileStatus();
    refreshQuickReplies();
  }
  // Over-budget rule-based answer: offer a manual "add anyway" (server re-prices and policy-checks the cart).
  function addSuggestion(s) {
    if (!s || !s.items || !s.items.length) return;
    var wrap = el('div', 'msg s suggest');
    wrap.appendChild(el('p', 'mut', i18nT('suggest.hint')));
    var group = el('div', 'chips');
    var label = s.items.map(function (i) { return i.quantity + '× ' + i.name; }).join(', ');
    var btn = el('button', 'suggest-add', i18nT('suggest.add') + ' ' + label + ' (' + s.totalFormatted + ')');
    btn.type = 'button';
    btn.onclick = function () {
      if (busy) return;
      cartSource = 'rule';
      cart = {}; s.items.forEach(function (i) { cart[i.productId] = i.quantity; });
      save(CKEY, cart); renderCart();
      btn.disabled = true; btn.textContent = i18nT('suggest.added');
    };
    group.appendChild(btn); wrap.appendChild(group);
    var log = $('log'); log.appendChild(wrap); log.scrollTop = log.scrollHeight;
  }
  var cartSource = null; // 'ai' | 'rule' once the assistant prepared (or the shopper added) a cart
  function ask(text) {
    if (busy || !text.trim()) return;
    quickReplyGeneration++;
    busy = true; $('send').disabled = true; say('u', text); $('msg').value = ''; say('s', i18nT('agent.searching'));
    var thinking = $('log').lastChild;
    api('/api/ai/chat', { method: 'POST', body: JSON.stringify({ message: text, preferences: prefs(), intent: 'catalog_discovery' }) }).then(function (r) {
      thinking.remove(); say('a', r.response || i18nT('agent.noAnswer'));
      if (r.preparedCart) { cartSource = r.mode === 'rule-based' ? 'rule' : 'ai'; }
      if (r.mode === 'rule-based') { say('s', i18nT('agent.ruleBased')); }
      if (r.mode === 'rule-based' && !r.preparedCart && r.suggestion) { addSuggestion(r.suggestion); }
      if (r.preparedCart && r.preparedCart.items) {
        cart = {}; r.preparedCart.items.forEach(function (i) { cart[i.productId] = i.quantity; });
        save(CKEY, cart); showPolicy(r.preparedCart); lastPrepared = r.preparedCart; renderWhy(lastPrepared);
      }
    }).catch(function (e) {
      thinking.remove(); say('s', e.status === 503 ? (e.body && e.body.details && e.body.details.code === 'AI_UNAVAILABLE' ? i18nT('agent.aiBusy') : i18nT('agent.notConfigured')) : i18nT('agent.error') + e.message);
    }).then(function () { busy = false; $('send').disabled = false; refreshQuickReplies(); renderCart(); });
  }

  // ---- Checkout -----------------------------------------------------------------------------
  function uuid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2); }
  function pay() {
    var items = Object.keys(cart).map(function (id) { return { productId: id, quantity: cart[id] }; });
    if (!items.length) return;
    busy = true; renderCart();
    var pbtn = $('pay'); pbtn.classList.add('loading'); pbtn.setAttribute('aria-busy', 'true'); pbtn.textContent = i18nT('checkout.contacting');
    api('/api/orders/create', { method: 'POST', headers: { 'Idempotency-Key': uuid() }, body: JSON.stringify({ items: items }) }).then(function (o) {
      if (!o.approvalUrl) throw new Error(i18nT('checkout.noLink'));
      save(PKEY, { orderId: o.orderId, paypalOrderId: o.paypalOrderId, total: o.totalFormatted });
      window.location.assign(o.approvalUrl);
    }).catch(function (e) {
      busy = false; pbtn.classList.remove('loading'); pbtn.removeAttribute('aria-busy'); renderCart();
      if (e.status === 403) { showPolicy({ policyDecision: 'BLOCK', reason: (e.body && (e.body.reason || e.body.suggestion)) || e.message }); }
      banner('bad', e.status === 503 ? i18nT('checkout.notConfigured') : i18nT('checkout.failed') + e.message);
    });
  }
  function handleReturn() {
    var q = new URLSearchParams(location.search); var st = q.get('paypal'); if (!st) return;
    history.replaceState(null, '', '/');
    var pend = load(PKEY);
    if (st === 'cancel') { drop(PKEY); banner('bad', i18nT('checkout.cancelled')); return; }
    if (!pend || pend.paypalOrderId !== q.get('token')) { banner('bad', i18nT('checkout.mismatch')); return; }
    var b = $('banner'); b.hidden = false; b.textContent = '';
    var box = el('div', 'ok'); box.appendChild(el('div', '', i18nT('receipt.approved') + pend.total + i18nT('receipt.approvedContinue')));
    var go = el('button', 'primary', i18nT('receipt.confirm')); go.style.marginTop = '8px';
    go.onclick = function () {
      go.disabled = true; go.classList.add('loading'); go.setAttribute('aria-busy', 'true'); go.textContent = i18nT('receipt.capturing');
      api('/api/orders/' + encodeURIComponent(pend.orderId) + '/capture', { method: 'POST', body: '{}' }).then(function (r) {
        var items = Object.keys(cart).map(function (id) { var p = catalog[id]; return { name: p.name, qty: cart[id], price: eur(p.priceMinor) }; });
        var decision = (policy && policy.decision) ? policy.decision : 'AUTO_ALLOW';
        go.classList.remove('loading'); go.removeAttribute('aria-busy');
        drop(PKEY); cart = {}; save(CKEY, cart); renderCart();
        b.hidden = true; b.textContent = '';
        renderReceipt({ orderId: pend.orderId, items: items, totalText: pend.total, maskedId: maskId(r.paypalCaptureId), decision: decision, status: r.status || 'COMPLETED' });
      }).catch(function (e) { go.disabled = false; go.classList.remove('loading'); go.removeAttribute('aria-busy'); go.textContent = i18nT('receipt.confirm'); banner('bad', 'Capture failed: ' + e.message); });
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
    if (d === 'REQUIRE_CONFIRMATION') return i18nT('decision.confirm.short');
    if (d === 'BLOCK') return i18nT('decision.block.short');
    return i18nT('decision.autoAllow.short');
  }
  // Hide the cart chrome while a receipt is on screen (and restore it on reset).
  function setCartChrome(v) {
    ['cart', 'policy', 'policy-note', 'cartTotal', 'pay', 'payNote'].forEach(function (id) { var n = $(id); if (n) n.hidden = !v; });
  }
  // Signed Cart Mandate: the tamper-evident record of what was proposed and who held payment authority.
  function mandateBlock(orderId) {
    var wrap = el('div', 'mandate');
    var btn = el('button', '', 'Verify signed Cart Mandate'); btn.type = 'button';
    var out = el('div', 'mut'); out.setAttribute('aria-live', 'polite');
    btn.onclick = function () {
      btn.disabled = true; out.textContent = 'Checking signature…';
      api('/api/orders/' + encodeURIComponent(orderId) + '/mandate').then(function (m) {
        return api('/api/mandates/verify', { method: 'POST', body: JSON.stringify(m), auth: false }).then(function (v) { return { m: m, v: v }; });
      }).then(function (r) {
        out.textContent = '';
        var ok = r.v.valid === true;
        out.appendChild(el('div', ok ? 'okline' : 'badline', (ok ? '✓ Signature valid' : '✗ Not valid') + ' · key ' + r.m.kid));
        out.appendChild(el('div', '', 'Matches the stored order: ' + (r.v.checks && r.v.checks.matchesOrder === true ? 'yes' : 'no')));
        out.appendChild(el('div', '', 'Agent may authorize payment: ' + (r.m.mandate.constraints.agentMayAuthorizePayment ? 'yes' : 'no')));
        out.appendChild(el('div', '', 'Payment authority: ' + r.m.mandate.constraints.paymentAuthority.replace(/_/g, ' ')));
        out.appendChild(el('div', '', 'Origin: ' + r.m.mandate.origin + ' · id ' + r.m.mandate.mandateId));
        btn.disabled = false;
      }).catch(function (e) { out.textContent = 'Could not check the mandate: ' + e.message; btn.disabled = false; });
    };
    wrap.appendChild(btn); wrap.appendChild(out);
    wrap.appendChild(qrBlock(orderId));
    return wrap;
  }
  // Receipt QR: scans to a public page that checks the signed Cart Mandate (/verify.html#<orderId>.<signature>).
  // The fragment is never sent to a server log; the signature in it is what authorises the read-only check.
  function verifyLink(orderId, signature) { return location.origin + '/verify.html#' + orderId + '.' + signature; }
  function qrBlock(orderId) {
    var box = el('div', 'qr'); box.hidden = true;
    try {
      if (typeof qrcode !== 'function') return box;
      api('/api/orders/' + encodeURIComponent(orderId) + '/mandate').then(function (m) {
        if (!m || typeof m.signature !== 'string') return;
        var link = verifyLink(orderId, m.signature);
        var q = qrcode(0, 'M'); q.addData(link); q.make();
        var img = document.createElement('img');
        img.src = q.createDataURL(4, 4); img.alt = i18nT('qr.alt'); img.width = img.height = q.getModuleCount() * 4 + 8;
        box.appendChild(img);
        box.appendChild(el('div', 'mut', i18nT('qr.hint')));
        var a = el('a', 'rlink', i18nT('qr.open')); a.href = link; a.setAttribute('rel', 'noopener'); a.setAttribute('target', '_blank');
        box.appendChild(a);
        box.hidden = false;
      }).catch(function () { /* the QR is an extra; the receipt stays complete without it */ });
    } catch (e) { /* same */ }
    return box;
  }
  function renderReceipt(d) {
    var box = $('receipt'); box.textContent = ''; box.hidden = false;
    box.appendChild(el('h3', '', i18nT('receipt.title')));
    box.appendChild(el('p', 'mut', i18nT('receipt.status') + (d.status || 'COMPLETED')));
    if (d.items && d.items.length) {
      var ul = el('ul', 'ritems');
      d.items.forEach(function (it) {
        var li = el('li', ''); li.appendChild(el('span', '', it.qty + '× ' + it.name)); li.appendChild(el('span', '', it.price));
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }
    box.appendChild(el('div', 'rtotal', i18nT('receipt.total') + d.totalText));
    box.appendChild(el('div', 'rmask', i18nT('receipt.captureId') + d.maskedId));
    box.appendChild(el('div', 'mut', i18nT('receipt.date') + fmtDate(new Date())));
    var steps = [i18nT('receipt.step.cart'), i18nT('receipt.step.policy') + ' — ' + decisionLabel(d.decision), i18nT('receipt.step.paypal'), i18nT('receipt.step.captured')];
    var ol = el('ol', 'rsteps');
    steps.forEach(function (t) { var li = el('li', 'step'); li.appendChild(el('span', 'ic', '✓')); li.appendChild(el('span', '', t)); ol.appendChild(li); });
    box.appendChild(ol);
    // Who did what: makes the AI / human split visible. The AI row appears only when an assistant prepared the cart.
    var who = el('div', 'who');
    who.appendChild(el('div', 'who-t', i18nT('who.title')));
    var whoRow = function (icon, text) { var r = el('div', 'who-r'); r.appendChild(el('span', 'who-i', icon)); r.appendChild(el('span', '', text)); who.appendChild(r); };
    if (cartSource === 'ai') whoRow('🤖', i18nT('who.ai'));
    else if (cartSource === 'rule') whoRow('⚙️', i18nT('who.rule'));
    whoRow('🧑', i18nT('who.you'));
    whoRow('🔒', i18nT('who.cannot'));
    box.appendChild(who);
    if (d.orderId) box.appendChild(mandateBlock(d.orderId));
    var link = el('a', 'rlink', i18nT('receipt.controlCenter')); link.href = '/dashboard.html'; link.setAttribute('rel', 'noopener');
    box.appendChild(link);
    setCartChrome(false);
  }
  function reset() {
    cart = {}; save(CKEY, cart); drop(PKEY);
    var r = $('receipt'); if (r) { r.textContent = ''; r.hidden = true; }
    var b = $('banner'); if (b) { b.hidden = true; b.textContent = ''; }
    policy = null; $('policy').textContent = ''; $('policy-note').textContent = '';
    setCartChrome(true); renderCart();
    say('s', i18nT('reset.done'));
  }
  // Exposed for headless verification only; not used by the normal flow.
  window.AICAFE = window.AICAFE || {}; window.AICAFE.renderReceipt = renderReceipt; window.AICAFE.reset = reset;

  // ---- Coco avatar + "Why these items?" + allergy note -------------------------------------
  function renderCoco() {
    var b = $('coco-badge'); if (!b) return;
    b.appendChild(buildCocoSvg());
    b.style.cursor = 'pointer';
    b.title = i18nT('onboarding.again');
    b.onclick = function () { var o = $('onboarding'); if (o) o.hidden = false; };
  }
  // Builds the "Why these items?" note strictly from the server response (reason + policy violations).
  function renderWhy(pc) {
    var box = $('cart-explain'); if (!box) return; box.textContent = '';
    if (!pc) { box.hidden = true; return; }
    box.hidden = false;
    box.appendChild(el('h4', '', i18nT('why.title')));
    var reason = (pc.reason || '').trim();
    var violations = (pc.policyViolations || []).map(function (v) { return (v && v.message) ? v.message : ''; }).filter(Boolean);
    if (reason || violations.length) {
      if (reason) box.appendChild(el('p', '', reason));
      if (violations.length) {
        var ul = el('ul', ''); violations.forEach(function (m) { ul.appendChild(el('li', '', m)); }); box.appendChild(ul);
      }
    } else {
      box.appendChild(el('p', '', i18nT('why.none')));
    }
  }

  // Local-only allergen concerns (mirrors the Flutter app). Never sent to the server.
  var ALLERGENS = [
    { k: 'gluten', en: 'Gluten', tr: 'Gluten' },
    { k: 'dairy', en: 'Dairy', tr: 'Süt' },
    { k: 'nuts', en: 'Tree nuts', tr: 'Fındık / ceviz' },
    { k: 'peanuts', en: 'Peanuts', tr: 'Yer fıstığı' },
    { k: 'soy', en: 'Soy', tr: 'Soya' },
    { k: 'egg', en: 'Egg', tr: 'Yumurta' },
    { k: 'fish', en: 'Fish', tr: 'Balık' },
    { k: 'shellfish', en: 'Shellfish', tr: 'Kabuklu deniz ürünü' }
  ];
  function allergenLabel(a) { return (window.i18n && window.i18n.lang === 'tr') ? a.tr : a.en; }
  function loadAllergens() { try { return JSON.parse(localStorage.getItem(AKEY) || '[]'); } catch (e) { return []; } }
  function saveAllergens(arr) { try { localStorage.setItem(AKEY, JSON.stringify(arr)); } catch (e) { /* ignore */ } }
  function renderAllergenChips() {
    var box = $('allergen-chips'); if (!box) return; box.textContent = '';
    var sel = loadAllergens();
    ALLERGENS.forEach(function (a) {
      var on = sel.indexOf(a.k) >= 0;
      var b = el('button', 'allergen-chip' + (on ? ' on' : ''), allergenLabel(a)); b.type = 'button';
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.onclick = function () {
        var s = loadAllergens(); var i = s.indexOf(a.k);
        if (i >= 0) s.splice(i, 1); else s.push(a.k);
        saveAllergens(s); renderAllergenChips(); renderAllergyNote();
      };
      box.appendChild(b);
    });
  }
  function renderAllergyNote() {
    var box = $('allergy-note'); if (!box) return; box.textContent = '';
    var sel = loadAllergens();
    if (!sel.length) { box.hidden = true; return; }
    box.hidden = false;
    var names = sel.map(function (k) { for (var i = 0; i < ALLERGENS.length; i++) { if (ALLERGENS[i].k === k) return allergenLabel(ALLERGENS[i]); } return k; });
    box.appendChild(el('b', '', i18nT('allergy.title') + ': '));
    box.appendChild(document.createTextNode(i18nT('allergy.concerns.prefix')));
    box.appendChild(el('span', '', names.join(', ')));
    box.appendChild(document.createTextNode(i18nT('allergy.concerns.local')));
  }

  // ---- Onboarding + i18n wiring -------------------------------------------------------------
  function renderChips() {
    var c = $('chips'); if (!c) return; c.textContent = '';
    [i18nT('chip.1'), i18nT('chip.2'), i18nT('chip.3')].forEach(function (t) {
      var b = el('button', '', t); b.type = 'button'; b.onclick = function () { ask(t); }; c.appendChild(b);
    });
  }
  function updateStatusPills() {
    if (!lastHealth) return;
    var a = $('b-ai'), p = $('b-pp');
    a.textContent = (lastHealth.ai && lastHealth.ai.enabled) ? i18nT('status.aiReady') : i18nT('status.aiOff');
    a.className = 'pill ' + ((lastHealth.ai && lastHealth.ai.enabled) ? 'on' : 'off');
    p.textContent = (lastHealth.paypal && lastHealth.paypal.enabled) ? i18nT('status.ppReady') + ' ' + lastHealth.paypal.environment : i18nT('status.ppOff');
    p.className = 'pill ' + ((lastHealth.paypal && lastHealth.paypal.enabled) ? 'on' : 'off');
  }
  // Re-render every dynamic, language-sensitive part. Triggered on language switch.
  function rerenderAll() {
    document.documentElement.lang = (window.i18n && window.i18n.lang) || 'en';
    renderChips();
    renderCatalog(allProducts);
    renderScenarios();
    renderCart();
    renderWhy(lastPrepared);
    renderAllergenChips();
    renderAllergyNote();
    updateStatusPills();
    renderProfileStatus();
    refreshQuickReplies();
  }
  function initI18n() {
    if (!window.i18n) return;
    i18n.applyStatic();
    var sel = $('lang');
    if (sel) {
      sel.value = i18n.lang;
      sel.addEventListener('change', function () { i18n.setLang(this.value); });
    }
    i18n.onChange = rerenderAll;
  }
  function initOnboarding() {
    var o = $('onboarding'); if (!o) return;
    if (!load(OKEY)) o.hidden = false;
    var ok = $('onb-ok');
    if (ok) ok.onclick = function () { o.hidden = true; save(OKEY, true); };
  }

  // ---- Boot ---------------------------------------------------------------------------------
  function boot() {
    // Repeatable "first visit" test hook: ?reset=1 clears all stored UI state
    // (session, pending order, cart, allergens, onboarding flag, language) so
    // the onboarding modal is guaranteed to appear again on this load without
    // the owner having to guess which localStorage key to clear.
    try {
      if (new URLSearchParams(location.search).get('reset') === '1') {
        drop(SKEY); drop(PKEY); drop(CKEY); drop(AKEY); drop(OKEY);
      }
    } catch (e) { /* ignore */ }

    session = load(SKEY); cart = load(CKEY) || {};
    initI18n();
    renderCoco();
    renderAllergenChips();
    renderChips();
    renderProfileStatus();
    $('chat-form').addEventListener('submit', function (e) { e.preventDefault(); ask($('msg').value); });
    $('diet').addEventListener('change', onProfileChange);
    $('budget').addEventListener('input', onProfileChange);
    $('pay').addEventListener('click', pay);
    $('reset').addEventListener('click', reset);
    say('a', i18nT('agent.greeting'));
    fetch('/api/health').then(function (r) { return r.json(); }).then(function (h) {
      lastHealth = h; updateStatusPills();
    }).catch(function () { /* badges stay neutral */ });
    fetch('/api/catalog').then(function (r) { return r.json(); }).then(function (c) { renderCatalog(c.products || []); renderScenarios(); renderCart(); handleReturn(); })
      .catch(function () { banner('bad', 'Could not load the menu. Is the API running?'); });
    renderCart();
    if (!session) ensureSession().catch(function () { /* retried on first request */ });
    initOnboarding();
  }
  boot();
})();
