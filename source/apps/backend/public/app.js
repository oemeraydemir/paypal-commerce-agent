(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var SKEY = 'aicafe.session', SPKEY = 'aicafe.split.active', PKEY = 'aicafe.pending', CKEY = 'aicafe.cart', AKEY = 'aicafe.allergens', DKEY = 'aicafe.dietary', BUDGETKEY = 'aicafe.baristaBudgetMinor', PROFILEKEY = 'aicafe.profile.saved.v2', SCOPEKEY = 'aicafe.scope', SAVEATKEY = 'aicafe.preferences.savedAt', OKEY = 'aicafe.onboarded';
  var catalog = {}, cart = {}, session = null, busy = false;
  var policy = null, pseq = 0, ptimer = null, activeCat = 'all', allProducts = [];
  var lastPrepared = null, lastHealth = null;
  var quickReplyGeneration = 0;
  var storedProfile = load(PROFILEKEY) || {}, legacyDietary = load(DKEY), legacyAllergens = load(AKEY);
  var initialBudget = storedProfile.maxBudgetMinor !== undefined ? storedProfile.maxBudgetMinor : load(BUDGETKEY);
  if (!Number.isInteger(initialBudget) || initialBudget < 100 || initialBudget > 10000 || initialBudget % 50 !== 0) initialBudget = null;
  var savedProfile = {
    dietary: Array.isArray(storedProfile.dietary) ? storedProfile.dietary : (Array.isArray(legacyDietary) ? legacyDietary : []),
    allergens: Array.isArray(storedProfile.allergens) ? storedProfile.allergens : (Array.isArray(legacyAllergens) ? legacyAllergens : []),
    maxBudgetMinor: initialBudget
  };
  var draftProfile = { dietary: savedProfile.dietary.slice(), allergens: savedProfile.allergens.slice(), maxBudgetMinor: savedProfile.maxBudgetMinor };
  var profileSavedAt = load(SAVEATKEY), profileMessage = '', profileSaving = false;
  var selectedScopeId = load(SCOPEKEY) || null, scopeValidated = !selectedScopeId, scopeLoading = false, scopeReady = !selectedScopeId;
  var policyError = null, previewLoading = false, scopeNotice = '';

  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  function drop(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  // Currency formatting follows the active locale via i18n; falls back to en-IE.
  function eurFallback(minor) { return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(minor / 100); }
  function eur(minor) { return (window.i18n && window.i18n.formatMoney) ? window.i18n.formatMoney(minor) : eurFallback(minor); }
  function i18nT(k) { return (window.i18n && window.i18n.t) ? window.i18n.t(k) : k; }
  function fmtDate(d) { return (window.i18n && window.i18n.formatDate) ? window.i18n.formatDate(d) : d.toLocaleString(); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function copyProfile(p) { return { dietary: (p.dietary || []).slice(), allergens: (p.allergens || []).slice(), maxBudgetMinor: p.maxBudgetMinor == null ? null : p.maxBudgetMinor }; }
  function arraysEqual(a, b) { return a.length === b.length && a.every(function (v, i) { return v === b[i]; }); }
  function profileChanged() {
    return !arraysEqual(draftProfile.dietary, savedProfile.dietary) ||
      !arraysEqual(draftProfile.allergens, savedProfile.allergens) ||
      draftProfile.maxBudgetMinor !== savedProfile.maxBudgetMinor;
  }
  function validatedBudgetMinor(value) {
    if (value === '') return { valid: true, value: null };
    var amount = Number(value);
    if (!isFinite(amount) || amount < 1 || amount > 100 || Math.round(amount * 2) !== amount * 2) return { valid: false };
    return { valid: true, value: Math.round(amount * 100) };
  }

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
      // An indented line just continues the previous option's explanation
      // (e.g. "   Mozzarella, ..."); it must not end the numbered Options list.
      if (list && source !== line && !/^\d/.test(line)) return;
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
    try { renderTakeHome(); } catch (e) { /* optional panel must never break the cart */ }
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
    renderScopeCheckoutNotice();
    schedulePolicy();
    scheduleWellbeing();
  }
  // UI convenience only: the server re-evaluates policy at /api/orders/create and is the sole authority.
  function updatePay() {
    var blocked = !!(policy && policy.decision === 'BLOCK' && Object.keys(cart).length);
    $('pay').disabled = busy || !Object.keys(cart).length || blocked || !policy || !!policyError || previewLoading || !scopeReady;
    if (!busy) $('pay').textContent = blocked ? i18nT('pay.blocked') : i18nT('pay.review');
    var so = $('split-open'); if (so) so.disabled = busy || !Object.keys(cart).length || blocked || !policy || !!policyError || previewLoading || !scopeReady || !!selectedScopeId;
  }
  function renderScopeCheckoutNotice() {
    var status = $('scope-selection-status');
    if (status) status.textContent = scopeNotice;
    var box = $('scope-cart-note'); if (!box) return;
    box.textContent = '';
    if (scopeNotice) box.appendChild(el('div', 'policy', scopeNotice));
    if (selectedScopeId) box.appendChild(el('div', 'mut', i18nT('scope.splitDisabled')));
  }
  function showPolicyPreviewError(error) {
    var box = $('policy'); box.textContent = '';
    var row = el('div', 'policy BLOCK', i18nT('scope.previewError') + (error && error.message ? ' ' + error.message : ''));
    var retry = el('button', 'secondary', i18nT('scope.retry')); retry.type = 'button';
    retry.onclick = function () { refreshPolicy(); };
    row.appendChild(retry); box.appendChild(row);
  }
  function showPolicy(c) {
    var box = $('policy-note'); box.textContent = '';
    if (!c || !c.policyDecision) return;
    var d = el('div', 'policy ' + c.policyDecision, decShort(c.policyDecision));
    if (c.reason) d.appendChild(el('div', 'mut', c.reason));
    box.appendChild(d);
  }
  function schedulePolicy() {
    clearTimeout(ptimer); pseq++;
    previewLoading = true; policyError = null; updatePay();
    var box = $('policy');
    if (box) { box.textContent = ''; box.appendChild(el('div', 'mut', i18nT('scope.previewLoading'))); }
    ptimer = setTimeout(refreshPolicy, 120);
  }
  function refreshPolicy() {
    var items = Object.keys(cart).map(function (id) { return { productId: id, quantity: cart[id] }; });
    var seq = ++pseq;
    previewLoading = true; policyError = null; updatePay();
    var body = { items: items };
    if (selectedScopeId) body.scopeId = selectedScopeId;
    api('/api/policy/preview', { method: 'POST', body: JSON.stringify(body) }).then(function (p) {
      if (seq !== pseq) return; // a newer cart state is already in flight
      previewLoading = false; policyError = null; policy = p; renderPolicy(p); updatePay();
    }).catch(function (e) {
      if (seq !== pseq) return;
      previewLoading = false; policy = null; policyError = e;
      var scopeCodes = ['SCOPE_NOT_FOUND', 'SCOPE_NOT_OWNED', 'SCOPE_PENDING', 'SCOPE_REVOKED', 'SCOPE_EXPIRED', 'SCOPE_SPENT', 'SCOPE_CURRENCY_MISMATCH', 'SCOPE_MERCHANT_NOT_ALLOWED', 'SCOPE_ORIGIN_NOT_ALLOWED', 'SCOPE_NO_DAILY_LIMIT'];
      var scopeCode = e.body && e.body.details && e.body.details.code;
      if (selectedScopeId && scopeCodes.indexOf(scopeCode) >= 0) {
        selectedScopeId = null; scopeValidated = true; scopeReady = true; drop(SCOPEKEY);
        scopeNotice = i18nT('scope.globalFallback') + ' ' + i18nT(scopeReasonKey(scopeCode));
        if ($('scope-select')) $('scope-select').value = '';
        schedulePolicy();
      } else {
        showPolicyPreviewError(e);
      }
      updatePay(); renderScopeCheckoutNotice();
    });
  }
  // Purchase impact (shown inside the existing mandate card, never as a second card).
  // Per-person amounts use the same display rule as the split preview; the server computes the real shares.
  var impactByOrder = {};
  function impactTotals() {
    var out = { orders: 0, refunded: 0, total: 0 };
    Object.keys(impactByOrder).forEach(function (k) { out.orders++; out.refunded += impactByOrder[k].refunded; out.total += impactByOrder[k].total; });
    return out;
  }
  function shareText(total, n) {
    var a = splitAmounts(total, n), seen = [], i;
    for (i = 0; i < a.length; i++) if (seen.indexOf(a[i]) < 0) seen.push(a[i]);
    return seen.map(eur).join(' + ') + (seen.length === 1 ? ' ' + i18nT('impact.each') : '');
  }
  function renderPolicy(p) {
    var box = $('policy'); box.textContent = '';
    var L = p.limits; var max = L.maxPerPurchaseMinor; var wrap = el('div', 'pbox' + (p.decision ? ' ' + p.decision : ''));
    var head = el('div', 'phead');
    head.appendChild(el('b', '', i18nT('mandate.title') + (p.decision ? ' · ' + decShort(p.decision) : '')));
    head.appendChild(el('span', 'pill', i18nT('policy.enforced')));
    wrap.appendChild(head);
    wrap.appendChild(el('div', 'mut', i18nT('mandate.subtitle')));
    var meter = el('div', 'meter'); meter.setAttribute('role', 'img');
    var total = p.empty ? 0 : p.totalMinor;
    meter.setAttribute('aria-label', 'Cart ' + eur(total) + ' of ' + eur(max) + ' maximum; ' + i18nT('policy.approvalAbove') + ' ' + eur(L.confirmationThresholdMinor));
    var fill = el('i', 'fill'); fill.style.width = Math.min(100, total / max * 100) + '%'; meter.appendChild(fill);
    var mark = el('i', 'mark'); mark.style.left = (L.confirmationThresholdMinor / max * 100) + '%'; meter.appendChild(mark);
    wrap.appendChild(meter);
    var scale = el('div', 'scale'); scale.appendChild(el('span', '', eur(0)));
    var thr = el('span', '', i18nT('policy.approvalAbove') + ' ' + eur(L.confirmationThresholdMinor)); scale.appendChild(thr);
    scale.appendChild(el('span', '', i18nT('policy.max') + ' ' + eur(max))); wrap.appendChild(scale);
    // Mandate summary: limit, scope, current cart, remaining allowance and a plain status line.
    var cartMinor = p.empty ? 0 : p.totalMinor, left = max - cartMinor;
    var expired = !!(L.validUntil && new Date(L.validUntil).getTime() <= Date.now());
    var st = expired ? 'expired' : (!p.empty && (p.decision === 'BLOCK' || cartMinor > max) ? 'exceeded' : (!p.empty && p.decision === 'REQUIRE_CONFIRMATION') ? 'reconfirm' : 'valid');
    var rows = el('ul', 'mandate-list');
    function mrow(k, v) { var li = el('li', ''); li.appendChild(el('span', 'k', k)); li.appendChild(el('span', 'v', v)); rows.appendChild(li); }
    mrow(i18nT('mandate.limit'), eur(max));
    var scopeLabel = i18nT('mandate.scopeValue');
    if (L.selectedScopeId) {
      var scopeSelect = $('scope-select');
      var selectedOption = scopeSelect && scopeSelect.options[scopeSelect.selectedIndex];
      scopeLabel = selectedOption ? selectedOption.textContent : i18nT('scope.selected');
    }
    mrow(i18nT('mandate.scope'), scopeLabel);
    mrow(i18nT('mandate.cart'), eur(cartMinor));
    mrow(i18nT('mandate.remaining'), left >= 0 ? eur(left) : i18nT('mandate.over') + ' ' + eur(-left));
    mrow(i18nT('mandate.status'), i18nT('mandate.' + st));
    mrow(i18nT('mandate.expires'), L.validUntil ? new Date(L.validUntil).toLocaleString() : i18nT('mandate.noExpiry'));
    mrow(i18nT('mandate.lastUpdated'), L.updatedAt ? new Date(L.updatedAt).toLocaleString() : i18nT('mandate.notRecorded'));
    if (!p.empty && cartMinor > 0) {
      mrow(i18nT('impact.split2'), shareText(cartMinor, 2));
      mrow(i18nT('impact.split3'), shareText(cartMinor, 3));
    }
    var imp = impactTotals();
    if (imp.orders) mrow(i18nT('impact.refunded'), eur(imp.refunded) + ' ' + i18nT('impact.of').replace('{t}', eur(imp.total)));
    wrap.appendChild(rows);
    var rules = el('ul', 'mandate-rules');
    ['mandate.rule1', 'mandate.rule2', 'mandate.rule3'].forEach(function (k) { rules.appendChild(el('li', '', i18nT(k))); });
    wrap.appendChild(rules);
    var violations = p.violations || [];
    var needsRenewal = !p.empty && (expired || violations.some(function (v) { return v.type === 'MAX_PURCHASE_EXCEEDED' || v.type === 'ALLOWANCE_EXPIRED'; }));
    if (needsRenewal) {
      var renew = el('button', 'secondary', i18nT('mandate.renew').replace('{amount}', eur(cartMinor)));
      renew.type = 'button';
      renew.onclick = function () {
        renew.disabled = true;
        var nextLimit = Math.max(max, cartMinor), nextDaily = Math.max(L.dailySpendLimitMinor, nextLimit);
        api('/api/policy', { method: 'PATCH', body: JSON.stringify({ maxPerPurchaseMinor: nextLimit, dailySpendLimitMinor: nextDaily, validUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString() }) })
          .then(function () { schedulePolicy(); })
          .catch(function (e) { renew.disabled = false; wrap.appendChild(el('div', 'policy BLOCK', e.message || i18nT('mandate.renewFailed'))); });
      };
      wrap.appendChild(renew);
      wrap.appendChild(el('div', 'mut', i18nT('mandate.renewScope')));
    }
    if (p.decision) {
      wrap.appendChild(el('div', 'mut', p.decision === 'BLOCK' && p.reason ? p.reason + '. ' + decLong('BLOCK') : decLong(p.decision)));
      var ul = el('ul', 'checks');
      p.checks.forEach(function (c) {
        var label = c.label, detail = c.detail;
        if (c.rule === 'scopeDailyBudget') {
          var scopeLimit = L.scopeDailySpendLimitMinor;
          label = scopeLimit == null
            ? i18nT('scope.dailyCheck')
            : i18nT('scope.dailyCheckLabel').replace('{limit}', eur(scopeLimit));
          if (scopeLimit != null) {
            var scopeLeft = scopeLimit - (L.scopeDailySpentMinor || 0) - (L.scopeDailyPendingMinor || 0) - cartMinor;
            detail = scopeLeft < 0
              ? i18nT('scope.dailyExceeded').replace('{amount}', eur(-scopeLeft))
              : i18nT('scope.dailyRemaining').replace('{amount}', eur(scopeLeft));
          }
        }
        var li = el('li', c.status); li.appendChild(el('span', 'ic', c.status === 'pass' ? '✓' : c.status === 'confirm' ? '!' : '✕'));
        var t = el('span', ''); t.appendChild(el('b', '', label + ': ')); t.appendChild(document.createTextNode(detail)); li.appendChild(t); ul.appendChild(li);
      });
      wrap.appendChild(ul);
    } else {
      wrap.appendChild(el('div', 'mut', i18nT('policy.dailyBudget') + eur(L.dailySpendLimitMinor) + ' (' + eur(L.dailyRemainingMinor) + i18nT('policy.dailyLeft')));
    }
    if (p.passport) wrap.appendChild(renderPassport(p.passport));
    box.appendChild(wrap);
  }

  // "Take it home" (Channel3): read-only suggestions that open the RETAILER's page. Never part of the PayPal cart,
  // never covered by the spending allowance. Requested only on click so a free-tier search quota is not spent on idle carts.
  function renderTakeHome() {
    var box = $('takehome'); if (!box) return; box.textContent = '';
    var ids = Object.keys(cart); if (!ids.length) return;
    var wrap = el('div', 'passport');
    wrap.appendChild(el('b', '', '🛍️ ' + i18nT('takehome.title')));
    var out = el('div', ''); var btn = el('button', 'secondary', i18nT('takehome.btn')); btn.type = 'button';
    btn.onclick = function () {
      btn.disabled = true; out.textContent = i18nT('takehome.loading');
      api('/api/discover/take-home', { method: 'POST', body: JSON.stringify({ items: ids.map(function (id) { return { productId: id }; }) }) }).then(function (r) {
        out.textContent = '';
        if (!r.enabled) { out.appendChild(el('div', 'mut', i18nT('takehome.off'))); return; }
        if (!r.items || !r.items.length) out.appendChild(el('div', 'mut', i18nT('takehome.none')));
        (r.items || []).forEach(function (it) {
          var card = el('div', 'card'); card.appendChild(el('div', 'card-t', it.title));
          var meta = [it.brand, it.merchantDomain, it.price != null ? (it.price + ' ' + (it.currency || '')).trim() : null].filter(Boolean).join(' · ');
          if (meta) card.appendChild(el('div', 'mut', meta));
          var a = document.createElement('a'); a.href = it.url; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow sponsored'; a.textContent = i18nT('takehome.open') + ' ↗';
          card.appendChild(a); out.appendChild(card);
        });
        out.appendChild(el('div', 'mut pp-note', i18nT('takehome.disclosure')));
      }).catch(function () { out.textContent = ''; out.appendChild(el('div', 'mut', i18nT('takehome.error'))); }).then(function () { btn.disabled = false; });
    };
    wrap.appendChild(btn); wrap.appendChild(out); box.appendChild(wrap);
  }

  // AI Transaction Passport: a derived, read-only explanation of the cart the server just evaluated.
  // Every number comes from /api/policy/preview (server prices and limits); nothing is computed or trusted here.
  function renderPassport(pp) {
    var d = document.createElement('details'); d.className = 'passport'; d.open = true;
    var sum = document.createElement('summary');
    sum.appendChild(el('b', '', '🛂 ' + i18nT('passport.title')));
    sum.appendChild(el('span', 'pill', eur(pp.totalMinor)));
    d.appendChild(sum);
    d.appendChild(el('div', 'mut', i18nT('passport.sub')));
    d.appendChild(el('div', 'pp-h', i18nT('passport.why')));
    var why = el('ul', 'pp-list');
    ['passport.why1', 'passport.why2', 'passport.why3'].forEach(function (k) { why.appendChild(el('li', '', i18nT(k))); });
    d.appendChild(why);
    var lines = el('ul', 'pp-lines');
    pp.lines.forEach(function (l) {
      var li = el('li', ''); li.appendChild(el('span', '', l.quantity + ' × ' + l.name));
      li.appendChild(el('span', 'v', eur(l.lineTotalMinor))); lines.appendChild(li);
    });
    d.appendChild(lines);
    d.appendChild(el('div', 'pp-h', i18nT('passport.control')));
    var m = pp.mandate, c = pp.control;
    var bar = el('div', 'pp-bar' + (c.withinLimit ? '' : ' over')); bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', m.usedPercent + '% ' + i18nT('passport.used'));
    var fill = el('i', ''); fill.style.width = m.usedPercent + '%'; bar.appendChild(fill);
    if (m.thresholdPercent > 0 && m.thresholdPercent < 100) { var mk = el('span', 'pp-mark'); mk.style.left = m.thresholdPercent + '%'; mk.title = i18nT('passport.threshold') + ': ' + eur(m.approvalThresholdMinor); bar.appendChild(mk); }
    d.appendChild(bar);
    d.appendChild(el('div', 'mut', m.usedPercent + '% ' + i18nT('passport.used') + ' (' + eur(m.cartMinor) + ' / ' + eur(m.maxPerPurchaseMinor) + ')'));
    var ctl = el('ul', 'pp-list');
    ctl.appendChild(el('li', c.withinLimit ? 'ok' : 'bad', i18nT(c.withinLimit ? 'passport.within' : 'passport.over')));
    ctl.appendChild(el('li', 'ok', i18nT('passport.nochange')));
    if (c.requiresShopperApproval) ctl.appendChild(el('li', 'ok', i18nT('passport.wait')));
    ctl.appendChild(el('li', 'ok', i18nT('passport.authority') + ': ' + i18nT('passport.you')));
    d.appendChild(ctl);
    d.appendChild(el('div', 'pp-lock', '🔒 ' + i18nT('passport.nochange') + ' · ' + i18nT('passport.authority') + ': ' + i18nT('passport.you')));
    d.appendChild(el('div', 'pp-h', i18nT('passport.flow')));
    var flow = el('ol', 'pp-flow');
    pp.steps.forEach(function (s) {
      var li = el('li', s.state); li.appendChild(el('span', 'ic', s.state === 'done' ? '✓' : s.state === 'blocked' ? '✕' : '○'));
      li.appendChild(document.createTextNode(i18nT('passport.s.' + s.key))); li.appendChild(el('span', 'pp-actor ' + s.actor, i18nT('passport.actor.' + s.actor))); flow.appendChild(li);
    });
    d.appendChild(flow);
    var map = { 'sample-menu-data': 'passport.n.sample', 'allergen-unverified': 'passport.n.allergen', 'sandbox-only': 'passport.n.sandbox' };
    pp.notices.forEach(function (n) { if (map[n]) d.appendChild(el('div', 'mut pp-note', map[n] && i18nT(map[n]))); });
    d.appendChild(el('div', 'mut pp-note', i18nT('passport.preview')));
    return d;
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
      var card = el('div', 'prod'); card.setAttribute('data-cat', p.category);
      // Same artwork the Flutter app bundles (assets/products/<id>.png): one source of truth for product visuals.
      var art = document.createElement('img'); art.className = 'art'; art.alt = ''; art.loading = 'lazy'; art.width = 96; art.height = 96;
      art.src = '/art/' + encodeURIComponent(p.id) + '.jpg';
      art.onerror = function () { art.onerror = null; art.src = '/art/cat_' + encodeURIComponent(p.category) + '.jpg'; art.onerror = function () { art.replaceWith(el('span', 'emo', CATEGORY_EMOJI[p.category] || '🛒')); }; };
      card.appendChild(art); card.appendChild(el('b', '', p.name)); card.appendChild(el('small', '', p.description));
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
    var out = { dietary: savedProfile.dietary.slice() };
    if (savedProfile.allergens && savedProfile.allergens.length) out.allergens = savedProfile.allergens.slice();
    if (savedProfile.maxBudgetMinor !== null && savedProfile.maxBudgetMinor !== undefined) out.maxBudgetMinor = savedProfile.maxBudgetMinor;
    return out;
  }
  function readProfileDraft() {
    var select = $('diet');
    var chosen = select && select.selectedOptions ? Array.from(select.selectedOptions) : null;
    if (chosen) {
      var selected = chosen.map(function (o) { return o.value; }).filter(Boolean);
      if (chosen.some(function (o) { return o.value === ''; })) selected = [];
      draftProfile.dietary = selected;
    }
    draftProfile.allergens = (draftProfile.allergens || []).slice();
    var budget = validatedBudgetMinor($('budget').value);
    var error = $('budget-error');
    if (error) {
      error.textContent = budget.valid ? '' : i18nT('profile.invalidBudget');
      error.hidden = budget.valid;
    }
    draftProfile.maxBudgetMinor = budget.valid ? budget.value : null;
    var saveButton = $('save-preferences');
    if (saveButton) saveButton.disabled = profileSaving || !profileChanged() || !budget.valid;
    return budget.valid;
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
    var summary = parts.length ? i18nT('profile.applied') + ' ' + parts.join(' · ') : i18nT('profile.none');
    if (profileSavedAt) summary += ' · ' + i18nT('profile.savedAt').replace('{time}', fmtDate(new Date(profileSavedAt)));
    status.textContent = profileMessage || summary;
    var saveButton = $('save-preferences');
    if (saveButton) saveButton.disabled = profileSaving || !profileChanged() || !validatedBudgetMinor($('budget').value).valid;
    var discardButton = $('discard-preferences');
    if (discardButton) discardButton.disabled = profileSaving || !profileChanged();
  }
  function syncProfileControls() {
    var select = $('diet');
    if (select) Array.from(select.options).forEach(function (option) {
      option.selected = option.value === '' ? draftProfile.dietary.length === 0 : draftProfile.dietary.indexOf(option.value) >= 0;
    });
    var budget = $('budget');
    if (budget) budget.value = draftProfile.maxBudgetMinor == null ? '' : String(draftProfile.maxBudgetMinor / 100);
    renderAllergenChips();
    readProfileDraft();
    renderProfileStatus();
  }
  function savePreferences() {
    if (profileSaving || !readProfileDraft()) return;
    if (!profileChanged()) return;
    var next = copyProfile(draftProfile);
    profileSaving = true; profileMessage = ''; renderProfileStatus();
    api('/api/wellbeing/preferences', {
      method: 'PUT',
      body: JSON.stringify({ preferences: { dietary: next.dietary, allergens: next.allergens } })
    }).then(function (response) {
      var saved = response && response.preferences;
      if (!saved || !Array.isArray(saved.dietary) || !Array.isArray(saved.allergens)) {
        throw new Error('The server did not confirm the saved preferences.');
      }
      try {
        localStorage.setItem(PROFILEKEY, JSON.stringify({
          dietary: saved.dietary, allergens: saved.allergens, maxBudgetMinor: next.maxBudgetMinor
        }));
      } catch (e) {
        profileMessage = i18nT('profile.saveError').replace('{error}', 'Browser storage is unavailable.');
        return;
      }
      savedProfile = { dietary: saved.dietary.slice(), allergens: saved.allergens.slice(), maxBudgetMinor: next.maxBudgetMinor };
      draftProfile = copyProfile(savedProfile);
      profileSavedAt = new Date().toISOString();
      try { localStorage.setItem(SAVEATKEY, JSON.stringify(profileSavedAt)); } catch (e) { /* saved in memory for this page */ }
      profileMessage = i18nT('profile.saved') + (profileSavedAt ? ' · ' + i18nT('profile.savedAt').replace('{time}', fmtDate(new Date(profileSavedAt))) : '');
      renderAllergenChips(); renderAllergyNote(); scheduleWellbeing();
    }).catch(function (e) {
      profileMessage = i18nT('profile.saveError').replace('{error}', e.message || String(e));
    }).then(function () {
      profileSaving = false;
      readProfileDraft();
      renderProfileStatus();
    });
  }
  function discardProfileDraft() {
    if (profileSaving) return;
    draftProfile = copyProfile(savedProfile);
    profileMessage = i18nT('profile.discarded');
    syncProfileControls();
  }
  function scopeStatusKey(s) {
    if (s.status === 'ACTIVE') return 'scope.status.active';
    if (s.status === 'PENDING_APPROVAL') return 'scope.status.pending';
    if (s.status === 'REVOKED') return 'scope.status.revoked';
    if (s.status === 'EXPIRED') return 'scope.status.expired';
    if (s.status === 'SPENT') return 'scope.status.spent';
    return s.status;
  }
  function scopeReasonKey(code) {
    return ({
      SCOPE_NOT_FOUND: 'scope.reason.missing',
      SCOPE_NOT_OWNED: 'scope.reason.ownership',
      SCOPE_PENDING: 'scope.reason.pending',
      SCOPE_REVOKED: 'scope.reason.revoked',
      SCOPE_EXPIRED: 'scope.reason.expired',
      SCOPE_SPENT: 'scope.reason.spent',
      SCOPE_CURRENCY_MISMATCH: 'scope.reason.currency',
      SCOPE_MERCHANT_NOT_ALLOWED: 'scope.reason.merchant',
      SCOPE_ORIGIN_NOT_ALLOWED: 'scope.reason.origin',
      SCOPE_NO_DAILY_LIMIT: 'scope.reason.noLimit'
    })[code] || 'scope.reason.unknown';
  }
  // Scoped allowances (Stage 2): list, approve, revoke, create. The profile
  // panel mounts this read/manage surface for the shopper's own scopes.
  function renderScopes() {
    var box = $('scopes'); if (!box || scopeLoading) return;
    scopeLoading = true;
    api('/api/policy/scopes').then(function (r) {
      var seen = {}, scopes = (r.scopes || []).filter(function (s) {
        if (!s || !s.id || seen[s.id]) return false;
        seen[s.id] = true; return true;
      });
      var select = $('scope-select'); select.textContent = '';
      var globalOption = el('option', '', i18nT('scope.global')); globalOption.value = ''; select.appendChild(globalOption);
      scopes.filter(function (s) { return s.status === 'ACTIVE' && s.dailySpendLimitMinor != null; }).forEach(function (s) {
        var option = el('option', '', s.label + ' · ' + eur(s.dailySpendLimitMinor));
        option.value = s.id; select.appendChild(option);
      });
      if (selectedScopeId) {
        var selectedScope = scopes.find(function (s) { return s.id === selectedScopeId; });
        var active = selectedScope && selectedScope.status === 'ACTIVE' && selectedScope.dailySpendLimitMinor != null;
        if (!active) {
          selectedScopeId = null; scopeValidated = true; scopeReady = true; drop(SCOPEKEY);
          var reason = selectedScope && selectedScope.status === 'ACTIVE' ? 'SCOPE_NO_DAILY_LIMIT'
            : selectedScope ? 'SCOPE_' + selectedScope.status.replace('_APPROVAL', '') : 'SCOPE_NOT_FOUND';
          scopeNotice = i18nT('scope.selectionInvalid') + ' ' + i18nT(scopeReasonKey(reason));
        } else {
          scopeValidated = true; scopeReady = true;
        }
      } else {
        scopeValidated = true; scopeReady = true;
      }
      select.value = selectedScopeId || '';
      box.textContent = '';
      if (!scopes.length) box.appendChild(el('p', 'mut', i18nT('scope.empty')));
      var groups = [
        { key: 'ACTIVE', title: 'scope.group.active' },
        { key: 'PENDING_APPROVAL', title: 'scope.group.pending' },
        { key: 'HISTORY', title: 'scope.group.history' }
      ];
      groups.forEach(function (group) {
        var rows = scopes.filter(function (s) {
          return group.key === 'HISTORY' ? ['REVOKED', 'EXPIRED', 'SPENT'].indexOf(s.status) >= 0 : s.status === group.key;
        });
        if (!rows.length) return;
        var section = el('div', 'scope-group'); section.appendChild(el('h4', '', i18nT(group.title)));
        rows.forEach(function (s) {
          var row = el('div', 'scope-row');
          row.appendChild(el('b', '', s.label)); row.appendChild(document.createTextNode(' · ' + s.currency + ' — '));
          row.appendChild(el('span', 'pill', i18nT(scopeStatusKey(s))));
          if (s.dailySpendLimitMinor != null) row.appendChild(el('div', 'mut', i18nT('policy.dailyBudget') + eur(s.dailySpendLimitMinor)));
          else row.appendChild(el('div', 'mut', i18nT('scope.noOwnLimit')));
          var actions = el('span', '');
          if (s.status === 'PENDING_APPROVAL') {
            var appBtn = el('button', 'secondary', i18nT('scope.approve')); appBtn.type = 'button';
            appBtn.onclick = function () {
              appBtn.disabled = true;
              api('/api/policy/scopes/' + encodeURIComponent(s.id) + '/approve', { method: 'POST', body: '{}' })
                .then(renderScopes).catch(function (e) { appBtn.disabled = false; row.appendChild(el('div', 'policy BLOCK', e.message || i18nT('scope.error'))); });
            };
            actions.appendChild(appBtn);
          }
          if (s.status === 'ACTIVE') {
            var revBtn = el('button', 'secondary', i18nT('scope.revoke')); revBtn.type = 'button';
            revBtn.onclick = function () {
              revBtn.disabled = true;
              api('/api/policy/scopes/' + encodeURIComponent(s.id) + '/revoke', { method: 'POST', body: '{}' })
                .then(function () {
                  if (selectedScopeId === s.id) {
                    selectedScopeId = null; scopeReady = true; scopeValidated = true; drop(SCOPEKEY);
                    scopeNotice = i18nT('scope.selectionInvalid');
                    schedulePolicy();
                  }
                  renderScopes();
                }).catch(function (e) { revBtn.disabled = false; row.appendChild(el('div', 'policy BLOCK', e.message || i18nT('scope.error'))); });
            };
            actions.appendChild(revBtn);
          }
          row.appendChild(actions); section.appendChild(row);
        });
        box.appendChild(section);
      });
      var form = el('form', 'scope-create');
      var labelIn = el('input', ''); labelIn.placeholder = i18nT('scope.label'); labelIn.setAttribute('aria-label', i18nT('scope.label'));
      var dailyIn = el('input', ''); dailyIn.type = 'number'; dailyIn.min = 1; dailyIn.step = '0.01'; dailyIn.placeholder = i18nT('scope.daily'); dailyIn.setAttribute('aria-label', i18nT('scope.daily'));
      var btn = el('button', 'secondary', i18nT('scope.submit')); btn.type = 'submit';
      form.appendChild(labelIn); form.appendChild(dailyIn); form.appendChild(btn);
      var creating = false;
      form.onsubmit = function (ev) {
        ev.preventDefault();
        if (creating) return;
        var dailyMinor = Math.round((parseFloat(dailyIn.value) || 0) * 100);
        var body = { label: labelIn.value.trim() || 'Scoped allowance', currency: 'EUR' };
        if (dailyMinor > 0) body.dailySpendLimitMinor = dailyMinor;
        creating = true; btn.disabled = true; btn.textContent = i18nT('scope.creating');
        api('/api/policy/scopes', { method: 'POST', body: JSON.stringify(body) })
          .then(function () { labelIn.value = ''; dailyIn.value = ''; renderScopes(); })
          .catch(function (e) { form.appendChild(el('div', 'policy BLOCK', e.message || i18nT('scope.error'))); })
          .then(function () { creating = false; btn.disabled = false; btn.textContent = i18nT('scope.submit'); });
      };
      box.appendChild(form);
      if (!scopeValidated) { scopeValidated = true; scopeReady = true; }
      if (policy || policyError) schedulePolicy();
      renderScopeCheckoutNotice(); renderSplitActive(); updatePay();
    }).catch(function () {
      box.textContent = ''; box.appendChild(el('p', 'policy BLOCK', i18nT('scope.error')));
      if (selectedScopeId) { scopeReady = false; updatePay(); }
      renderSplitActive();
    }).then(function () { scopeLoading = false; });
  }
  function onProfileChange() {
    readProfileDraft();
    profileMessage = profileChanged() ? '' : profileMessage;
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
    // The Barista only ever uses the SAVED profile. Unsaved edits never leak into a request; the
    // shopper is told so instead of being blocked.
    var draftIsPending = !readProfileDraft() || profileChanged();
    quickReplyGeneration++;
    busy = true; $('send').disabled = true; say('u', text); $('msg').value = '';
    if (draftIsPending) say('s', i18nT('profile.usingSaved'));
    say('s', i18nT('agent.searching'));
    var thinking = $('log').lastChild;
    var chatBody = { message: text, preferences: prefs(), intent: 'catalog_discovery' };
    if (selectedScopeId) chatBody.scopeId = selectedScopeId;
    api('/api/ai/chat', { method: 'POST', body: JSON.stringify(chatBody) }).then(function (r) {
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
    if (!items.length || !policy || policyError || previewLoading || !scopeReady || policy.decision === 'BLOCK') return;
    busy = true; renderCart();
    var pbtn = $('pay'); pbtn.classList.add('loading'); pbtn.setAttribute('aria-busy', 'true'); pbtn.textContent = i18nT('checkout.contacting');
    var orderBody = { items: items };
    if (selectedScopeId) orderBody.scopeId = selectedScopeId;
    syncWellbeing().then(function () { return api('/api/orders/create', { method: 'POST', headers: { 'Idempotency-Key': uuid() }, body: JSON.stringify(orderBody) }); }).then(function (o) {
      if (!o.approvalUrl) throw new Error(i18nT('checkout.noLink'));
      save(PKEY, { orderId: o.orderId, paypalOrderId: o.paypalOrderId, total: o.totalFormatted, cartItems: items });
      // Link any held pickup booking to the order the customer is about to pay.
      // This is best-effort: if it fails we still proceed to PayPal and let the
      // server reconciliation reconcile the booking from the authoritative order
      // status later. Never blocks checkout.
      linkPickupBooking(o.orderId).catch(function () {}).then(function () {
        window.location.assign(o.approvalUrl);
      });
    }).catch(function (e) {
      busy = false; pbtn.classList.remove('loading'); pbtn.removeAttribute('aria-busy'); renderCart();
      if (e.status === 403) { showPolicy({ policyDecision: 'BLOCK', reason: (e.body && (e.body.reason || e.body.suggestion)) || e.message }); }
      if (e.status === 409 && e.body && e.body.details && e.body.details.code === 'SPLIT_BILL_ACTIVE') {
        if (e.body.details.billId) save(SPKEY, { billId: e.body.details.billId });
        renderSplitActive(); banner('bad', i18nT('split.cartActive')); return;
      }
      banner('bad', e.status === 503 ? i18nT('checkout.notConfigured') : i18nT('checkout.failed') + e.message);
    });
  }
  function handleReturn() {
    var q = new URLSearchParams(location.search); var st = q.get('paypal'); if (!st) return;
    history.replaceState(null, '', '/');
    var pend = load(PKEY);
    // A Split Bill share paid in PayPal: the shopper (organiser or guest) goes back to the
    // split room, which owns the capture step and shows everyone's status.
    if (pend && pend.billId && (st === 'cancel' || pend.paypalOrderId === q.get('token'))) {
      window.location.replace('/split#b=' + encodeURIComponent(pend.billId) + (st === 'success' ? '&return=1' : ''));
      return;
    }
    if (st === 'cancel') { drop(PKEY); banner('bad', i18nT('checkout.cancelled')); return; }
    if (!pend || pend.paypalOrderId !== q.get('token')) { banner('bad', i18nT('checkout.mismatch')); return; }
    var b = $('banner'); b.hidden = false; b.textContent = '';
    var box = el('div', 'ok'); box.appendChild(el('div', '', i18nT('receipt.approved') + pend.total + i18nT('receipt.approvedContinue')));
    var go = el('button', 'primary', i18nT('receipt.confirm')); go.style.marginTop = '8px';
    go.onclick = function () {
      go.disabled = true; go.classList.add('loading'); go.setAttribute('aria-busy', 'true'); go.textContent = i18nT('receipt.capturing');
      api('/api/orders/' + encodeURIComponent(pend.orderId) + '/capture', { method: 'POST', body: '{}' }).then(function (r) {
      go.classList.remove('loading'); go.removeAttribute('aria-busy');
      drop(PKEY);
      var matchesPendingCart = Array.isArray(pend.cartItems) && Object.keys(cart).length === pend.cartItems.length &&
        pend.cartItems.every(function (item) { return cart[item.productId] === item.quantity; });
      if (matchesPendingCart) { cart = {}; save(CKEY, cart); renderCart(); }
      b.hidden = true; b.textContent = '';
      if (window.AiCafeShell && window.AiCafeShell.go) window.AiCafeShell.go('order/' + encodeURIComponent(pend.orderId));
      else openOrder(pend.orderId);
    }).catch(function (e) { go.disabled = false; go.classList.remove('loading'); go.removeAttribute('aria-busy'); go.textContent = i18nT('receipt.confirm'); banner('bad', 'Capture failed: ' + e.message); });
    };
    box.appendChild(go); b.appendChild(box);
  }

  // ---- Split bill (checkout option) ------------------------------------------------------
  // The shopper explicitly chooses "Split the bill" at checkout. The cart is sent as
  // product ids + quantities only: the SERVER re-prices it, enforces the spending policy
  // on the whole cart, computes every share, and decides who may pay what. The amounts
  // previewed here are display-only and use the same deterministic rule as the server.
  var split = { n: 2, busy: false };
  function splitAmounts(total, n) {
    var base = Math.floor(total / n), rem = total % n, out = [], i;
    for (i = 0; i < n; i++) out.push(base + (i < rem ? 1 : 0));
    return out;
  }
  function renderSplitPreview() {
    var box = $('split-preview'); if (!box) return; box.textContent = '';
    var total = cartTotal(), amounts = splitAmounts(total, split.n);
    var sm = $('split-mandate');
    if (sm) {
      var lim = policy && policy.limits ? eur(policy.limits.maxPerPurchaseMinor) : '—';
      sm.textContent = i18nT('split.mandate').replace('{l}', lim).replace('{t}', eur(total));
    }
    var t = el('div', 'kv'); t.appendChild(el('span', 'k', i18nT('split.total'))); t.appendChild(el('span', '', eur(total))); box.appendChild(t);
    amounts.forEach(function (a, i) {
      var r = el('div', 'kv' + (i === 0 ? ' big' : ''));
      r.appendChild(el('span', 'k', (i === 0 ? i18nT('room.you') : i18nT('room.person') + ' ' + (i + 1))));
      r.appendChild(el('span', '', eur(a)));
      box.appendChild(r);
    });
  }
  function renderSplitPeople() {
    var box = $('split-people'); if (!box) return; box.textContent = '';
    [2, 3].forEach(function (n) {
      var b = el('button', '', n + ' ' + i18nT('split.peopleUnit')); b.type = 'button';
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(split.n === n));
      b.onclick = function () { split.n = n; renderSplitPeople(); renderSplitPreview(); };
      box.appendChild(b);
    });
  }
  function splitErr(msg) { var e = $('split-err'); if (!e) return; e.hidden = !msg; e.textContent = msg || ''; }
  function openSplit() {
    if (!Object.keys(cart).length || selectedScopeId) { splitErr(i18nT('scope.splitDisabled')); return; }
    var active = load(SPKEY);
    if (active && active.billId) { window.location.assign('/split#b=' + encodeURIComponent(active.billId)); return; }
    split.n = 2; split.busy = false; splitErr('');
    var go = $('split-go'); go.disabled = false; go.textContent = i18nT('split.confirm');
    renderSplitPeople(); renderSplitPreview();
    $('split-modal').hidden = false; go.focus();
  }
  function closeSplit() { $('split-modal').hidden = true; var o = $('split-open'); if (o) o.focus(); }
  function createSplit() {
    if (split.busy) return; // a double click must never create two bills
    var items = Object.keys(cart).map(function (id) { return { productId: id, quantity: cart[id] }; });
    if (!items.length) return;
    split.busy = true; splitErr('');
    var go = $('split-go'); go.disabled = true; go.textContent = i18nT('split.creating');
    syncWellbeing().then(function () { return api('/api/bills', { method: 'POST', body: JSON.stringify({ items: items, participantCount: split.n }) }); }).then(function (b) {
      save(SPKEY, { billId: b.id });
      window.location.assign('/split#b=' + encodeURIComponent(b.id));
    }).catch(function (e) {
      split.busy = false; go.disabled = false; go.textContent = i18nT('split.confirm');
      if (e.status === 403) { showPolicy({ policyDecision: 'BLOCK', reason: (e.body && (e.body.reason || e.body.suggestion)) || e.message }); }
      splitErr(i18nT('split.failed') + ((e.body && (e.body.reason || e.body.suggestion)) || e.message));
    });
  }
  function renderSplitActive() {
    var box = $('split-active'); if (!box) return;
    var a = load(SPKEY); box.textContent = '';
    if (!a || !a.billId) { box.hidden = true; return; }
    box.hidden = false;
    if (selectedScopeId) {
      box.appendChild(el('div', 'policy', i18nT('scope.splitDisabled')));
      return;
    }
    box.appendChild(el('span', '', i18nT('split.active')));
    var open = el('button', 'primary', i18nT('split.resume')); open.type = 'button';
    open.onclick = function () { window.location.assign('/split#b=' + encodeURIComponent(a.billId)); };
    box.appendChild(open);
  }
  function initSplit() {
    var so = $('split-open'); if (!so) return;
    so.addEventListener('click', openSplit);
    $('split-cancel').addEventListener('click', closeSplit);
    $('split-go').addEventListener('click', createSplit);
    $('split-modal').addEventListener('click', function (e) { if (e.target === this) closeSplit(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('split-modal').hidden) closeSplit(); });
    renderSplitActive();
  }

  // ---- Pickup planner ------------------------------------------------------------------
  var BKEY = 'aicafe.pickupBooking';
  var pickup = { booking: load(BKEY), reserving: false };
  var PICKUP_DAYS = 3;

  function pickupDayStrs() {
    // Local calendar dates (the café's slots are wall-clock times); toISOString() would use UTC
    // and show the wrong day for the first hours after midnight.
    var out = [], i, d;
    function two(n) { return (n < 10 ? '0' : '') + n; }
    for (i = 0; i < PICKUP_DAYS; i++) {
      d = new Date(); d.setDate(d.getDate() + i);
      out.push(d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()));
    }
    return out;
  }

  function fmtWindow(startTs, endTs) {
    function tf(d) { return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    return tf(startTs) + ' – ' + tf(endTs);
  }

  function pickupStatusLabel(st) {
    if (st === 'HELD') return i18nT('pickup.status.held');
    if (st === 'CONFIRMED') return i18nT('pickup.status.confirmed');
    if (st === 'RELEASED') return i18nT('pickup.status.released');
    return i18nT('pickup.status.unresolved');
  }

  function pickupStatusClass(st) {
    if (st === 'HELD') return 'held';
    if (st === 'CONFIRMED') return 'confirmed';
    if (st === 'RELEASED') return 'released';
    return '';
  }

  function fetchPickupAvailability() {
    var days = pickupDayStrs();
    return Promise.all(days.map(function (day) {
      return api('/api/pickup/availability?day=' + day).then(function (r) {
        return (r && r.slots) ? r.slots : [];
      }).catch(function () { return []; });
    })).then(function (byDay) {
      var map = {}, i;
      for (i = 0; i < days.length; i++) map[days[i]] = byDay[i] || [];
      return map;
    });
  }

  function reservePickupSlot(slotId) {
    if (pickup.reserving || pickup.booking) return;
    pickup.reserving = true; renderPickup();
    api('/api/pickup/reserve', { method: 'POST', body: JSON.stringify({ slotId: slotId }) }).then(function (r) {
      if (r && r.bookingId) {
        pickup.booking = { bookingId: r.bookingId, slotId: slotId, status: 'HELD' };
        save(BKEY, pickup.booking);
        banner('ok', i18nT('pickup.reserved'));
      } else {
        banner('bad', i18nT('pickup.error.reserve'));
      }
    }).catch(function (e) {
      var msg = i18nT('pickup.error.reserve');
      var body = e.body || {};
      if (e.status === 409 && body.details && (body.details.code === 'SLOT_FULL' || body.details.code === 'SLOT_NOT_FOUND')) {
        msg = i18nT('pickup.error.full');
      } else if (e.status === 409 && body.details && body.details.code === 'ALREADY_HELD') {
        msg = i18nT('pickup.error.held');
      }
      banner('bad', msg);
    }).then(function () { pickup.reserving = false; renderPickup(); });
  }

  function releasePickupBooking() {
    var b = pickup.booking;
    if (!b || !b.bookingId || pickup.reserving) return;
    pickup.reserving = true; renderPickup();
    api('/api/pickup/release', { method: 'POST', body: JSON.stringify({ bookingId: b.bookingId }) }).then(function () {
      pickup.booking = null; drop(BKEY); banner('ok', i18nT('pickup.released'));
    }).catch(function () {
      // Idempotent server-side: if it was already released, clear locally anyway.
      pickup.booking = null; drop(BKEY); banner('bad', i18nT('pickup.error.release'));
    }).then(function () { pickup.reserving = false; renderPickup(); });
  }

  function linkPickupBooking(orderId) {
    var b = pickup.booking;
    if (!b || !b.bookingId) return Promise.resolve();
    return api('/api/pickup/link', { method: 'POST', body: JSON.stringify({ bookingId: b.bookingId, orderId: orderId }) })
      .then(function (r) {
        if (r && r.status) { b.status = r.status; pickup.booking = b; save(BKEY, b); }
      })
      .catch(function () { /* reconciliation is authoritative; do not block checkout */ });
  }

  function renderPickup() {
    var box = $('pickup'); if (!box) return;
    box.textContent = '';
    box.appendChild(el('h3', '', i18nT('pickup.title')));

    if (pickup.booking && pickup.booking.bookingId) {
      var b = pickup.booking;
      var statusWrap = el('div', 'pbox ' + pickupStatusClass(b.status));
      statusWrap.appendChild(el('div', 'phead', pickupStatusLabel(b.status)));
      if (b.status === 'HELD') {
        var cancelBtn = el('button', '', i18nT('pickup.cancel'));
        cancelBtn.type = 'button'; cancelBtn.disabled = pickup.reserving;
        cancelBtn.onclick = releasePickupBooking;
        statusWrap.appendChild(cancelBtn);
      }
      box.appendChild(statusWrap);
      return; // while a booking is held, hide slot selection to keep it simple
    }

    fetchPickupAvailability().then(function (byDay) {
      if ($('pickup') !== box) return;
      var days = Object.keys(byDay);
      var hasAny = false;
      days.forEach(function (day) {
        var slots = byDay[day];
        if (!slots.length) return;
        hasAny = true;
        var grp = el('div', 'pickup-day');
        grp.appendChild(el('div', 'pickup-day-label', (window.i18n && window.i18n.formatDay) ? window.i18n.formatDay(new Date(day + 'T00:00:00')) : new Date(day + 'T00:00:00').toLocaleDateString()));
        slots.forEach(function (slot) {
          var remaining = slot.remaining || 0;
          var btn = el('button', 'pickup-slot', '');
          btn.type = 'button';
          btn.disabled = pickup.reserving || remaining <= 0;
          btn.appendChild(el('span', 'pu-window', fmtWindow(slot.startTs, slot.endTs)));
          btn.appendChild(el('span', 'pu-cap', remaining > 0 ? (remaining + ' left') : i18nT('pickup.full')));
          btn.onclick = (function (sid) { return function () { reservePickupSlot(sid); }; })(slot.id);
          grp.appendChild(btn);
        });
        box.appendChild(grp);
      });
      if (!hasAny) box.appendChild(el('p', 'mut', i18nT('pickup.none')));
    });
  }

  // ---- Receipt + demo reset ------------------------------------------------------------------
  function maskId(id) {
    if (!id) return '—';
    if (id.length <= 4) return '••••';
    return id.slice(0, 3) + '••••' + id.slice(-3);
  }
  function decisionLabel(d) {
    if (d === 'REQUIRE_CONFIRMATION') return i18nT('decision.confirm.short');
    if (d === 'BLOCK') return i18nT('decision.block.short');
    return i18nT('decision.autoAllow.short');
  }
  // Hide the cart chrome while a receipt is on screen (and restore it on reset).
  function setCartChrome(v) {
    ['cart', 'policy', 'policy-note', 'cartTotal', 'pay', 'payNote', 'split-open', 'split-hint'].forEach(function (id) { var n = $(id); if (n) n.hidden = !v; });
  }
  // Signed Cart Mandate: the tamper-evident record of what was proposed and who held payment authority.
  function mandateBlock(orderId) {
    var wrap = el('div', 'mandate');
    var btn = el('button', '', i18nT('mandate.verify')); btn.type = 'button';
    var out = el('div', 'mut'); out.setAttribute('aria-live', 'polite');
    btn.onclick = function () {
      btn.disabled = true; out.textContent = i18nT('mandate.checking');
      api('/api/orders/' + encodeURIComponent(orderId) + '/mandate').then(function (m) {
        return api('/api/mandates/verify', { method: 'POST', body: JSON.stringify(m), auth: false }).then(function (v) { return { m: m, v: v }; });
      }).then(function (r) {
        out.textContent = '';
        var ok = r.v.valid === true;
        out.appendChild(el('div', ok ? 'okline' : 'badline', (ok ? i18nT('mandate.signatureValid') : i18nT('mandate.signatureInvalid')) + ' · key ' + r.m.kid));
        out.appendChild(el('div', '', i18nT('mandate.matchesOrder') + ': ' + (r.v.checks && r.v.checks.matchesOrder === true ? i18nT('common.yes') : i18nT('common.no'))));
        out.appendChild(el('div', '', i18nT('mandate.agentMayAuthorize') + ': ' + (r.m.mandate.constraints.agentMayAuthorizePayment ? i18nT('common.yes') : i18nT('common.no'))));
        out.appendChild(el('div', '', i18nT('mandate.paymentAuthority') + ': ' + r.m.mandate.constraints.paymentAuthority.replace(/_/g, ' ')));
        out.appendChild(el('div', '', i18nT('mandate.origin') + ': ' + r.m.mandate.origin + ' · id ' + r.m.mandate.mandateId));
        btn.disabled = false;
      }).catch(function (e) { out.textContent = i18nT('mandate.error') + e.message; btn.disabled = false; });
    };
    wrap.appendChild(btn); wrap.appendChild(out);
    wrap.appendChild(qrBlock(orderId));
    // Show the Cart Mandate verdict immediately; the button still allows re-verifying.
    if (typeof api === 'function') { try { btn.onclick(); } catch (e) { /* graceful */ } }
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
  // ---- Dispute Evidence Package (Stage 3) + Order-to-Resolution Passport -----------------------
  // The package is assembled by the SERVER from its own records (signed Cart Mandate, policy
  // events, order, human approval) and signed with the same keyring, so a third party can
  // verify it without trusting this page. It is prepared for presentation only: nothing is
  // ever submitted to PayPal automatically.
  // ---- Refund request (customer) ---------------------------------------------------------------
  // Asking never moves money: it files a request that a merchant reviews. The status shown here
  // comes from the server; nothing is refunded automatically.
  var REFUND_REASONS = ['wrong_item', 'not_as_described', 'duplicate_charge', 'changed_mind', 'other'];
  function refundBlock(orderId) {
    var wrap = el('div', 'mandate');
    wrap.appendChild(el('div', 'who-t', i18nT('refund.title')));
    wrap.appendChild(el('div', 'mut', i18nT('refund.subtitle')));
    var out = el('div', 'mut'); out.setAttribute('aria-live', 'polite'); out.tabIndex = -1;
    var form = el('div', ''); form.style.marginTop = '8px';
    var base = '/api/orders/' + encodeURIComponent(orderId);
    var previousStatus = null, lastChecked = null;

    function statusLine(r) {
      var key = { UNDER_REVIEW: 'refund.status.review', BEING_PROCESSED: 'refund.status.processing', REFUNDED: 'refund.status.refunded', DECLINED: 'refund.status.declined' }[r.status] || 'refund.status.review';
      return eur(r.amountMinor) + ' · ' + i18nT(key);
    }
    function load(manual) {
      var check = form.querySelector('.refund-check');
      var restoreFocus = !!(manual && check && document.activeElement === check);
      if (manual) {
        out.textContent = i18nT('order.checking');
        if (check) check.disabled = true;
      }
      return api(base + '/refund-status').then(function (d) {
        out.textContent = ''; form.textContent = '';
        var currentStatus = JSON.stringify((d.refunds || []).map(function (r) { return [r.id, r.status, r.amountMinor]; }));
        if (manual && previousStatus !== null && currentStatus === previousStatus) {
          out.appendChild(el('div', 'mut', i18nT('order.noChange')));
        }
        previousStatus = currentStatus; lastChecked = new Date();
        out.appendChild(el('small', 'mut', i18nT('order.lastChecked').replace('{time}', fmtDate(lastChecked))));
        var refundedSum = 0;
        (d.refunds || []).forEach(function (r) { if (r.status === 'REFUNDED') refundedSum += r.amountMinor; });
        impactByOrder[orderId] = { refunded: refundedSum, total: (d.refundableMinor || 0) + refundedSum };
        if (policy) renderPolicy(policy);
        var open = false;
        (d.refunds || []).forEach(function (r) {
          out.appendChild(el('div', '', statusLine(r)));
          if (r.status === 'UNDER_REVIEW' || r.status === 'BEING_PROCESSED') open = true;
        });
        if (open) {
          var chk = el('button', 'refund-check', i18nT('refund.check')); chk.type = 'button'; chk.onclick = function () { load(true); }; form.appendChild(chk);
        } else if (d.refundableMinor > 0) {
          var sel = el('select', ''); sel.setAttribute('aria-label', i18nT('refund.reasonLabel'));
          REFUND_REASONS.forEach(function (c) { var o = el('option', '', i18nT('refund.reason.' + c)); o.value = c; sel.appendChild(o); });
          var note = el('input', ''); note.type = 'text'; note.maxLength = 120; note.placeholder = i18nT('refund.note'); note.setAttribute('aria-label', i18nT('refund.note'));
          note.style.cssText = 'width:100%;margin:6px 0';
          var go = el('button', 'primary', i18nT('refund.request')); go.type = 'button';
          go.onclick = function () {
            go.disabled = true; go.textContent = i18nT('refund.sending');
            api(base + '/refund-request', { method: 'POST', body: JSON.stringify({ reason: sel.value, note: note.value }) })
              .then(load)
              .catch(function (e) { go.disabled = false; go.textContent = i18nT('refund.request'); out.textContent = i18nT('refund.failed') + e.message; });
          };
          form.appendChild(sel); form.appendChild(note); form.appendChild(go);
        }
        if (restoreFocus) {
          var nextFocus = form.querySelector('button');
          (nextFocus || out).focus();
        }
      }).catch(function (e) {
        out.textContent = i18nT('order.checkError').replace('{error}', e.message || i18nT('refund.unavailable'));
        form.textContent = '';
        var retry = el('button', 'refund-check', i18nT('refund.check')); retry.type = 'button'; retry.onclick = function () { load(true); };
        form.appendChild(retry);
        if (restoreFocus) retry.focus();
      });
    }
    wrap.appendChild(out); wrap.appendChild(form);
    load();
    return wrap;
  }

  function evidenceBlock(orderId) {
    var wrap = el('div', 'mandate');
    wrap.appendChild(el('div', 'who-t', i18nT('evidence.title')));
    wrap.appendChild(el('div', 'mut', i18nT('evidence.subtitle')));

    var open = el('button', '', i18nT('evidence.open')); open.type = 'button';
    var out = el('div', 'mut'); out.setAttribute('aria-live', 'polite');

    function stamp(v) {
      if (!v) return '';
      var d = new Date(v);
      return isNaN(d.getTime()) ? '' : fmtDate(d);
    }
    function short(v) {
      return (typeof v === 'string' && v.length > 16) ? v.slice(0, 16) + '…' : (v || '—');
    }
    // Order-to-Resolution Passport: the order/payment/approval timeline in ONE place.
    // Prefers the server-built canonical timeline (Priority 1); falls back to
    // deriving it from the order + policy events for older packages.
    function passport(p) {
      var list = el('ol', 'rsteps');
      var add = function (when, what, detail) {
        var li = el('li', 'step');
        li.appendChild(el('span', 'ic', '✓'));
        var body = el('span', '');
        body.appendChild(el('div', '', what));
        if (detail) body.appendChild(el('div', 'mut', detail));
        if (when) body.appendChild(el('div', 'mut', when));
        li.appendChild(body);
        list.appendChild(li);
      };
      var ha = p.humanApproval || {};
      var state = ha.state === 'approved' ? i18nT('evidence.approval.approved')
        : ha.state === 'awaiting_approval' ? i18nT('evidence.approval.awaiting')
        : i18nT('evidence.approval.notRecorded');
      var tl = p.timeline || [];
      if (tl.length) {
        var labelFor = {
          ORDER_CREATED: i18nT('evidence.step.created'),
          POLICY_EVALUATED: i18nT('evidence.step.policy'),
          HUMAN_APPROVAL: i18nT('evidence.step.approval'),
          PAYMENT_CAPTURED: i18nT('evidence.step.captured'),
          REFUND_REQUESTED: i18nT('evidence.step.refundRequested'),
          REFUND_ISSUED: i18nT('evidence.step.refundIssued'),
          REFUND_DECLINED: i18nT('evidence.step.refundDeclined')
        };
        tl.forEach(function (s) {
          var what = labelFor[s.step] || s.step;
          var detail = s.detail || '';
          if (s.step === 'POLICY_EVALUATED') {
            what += ' — ' + (s.decision || '');
          } else if (s.step === 'HUMAN_APPROVAL') {
            detail = state;
          } else if (s.step === 'PAYMENT_CAPTURED' && detail) {
            detail = maskId(detail);
          }
          add(stamp(s.at), what, detail);
        });
      } else {
        var o = p.order || {};
        add(stamp(o.createdAt), i18nT('evidence.step.created'), o.id || '');
        var events = p.policyEvents || [];
        events.forEach(function (e) {
          var rules = (e.violatedRules || []).join(', ');
          var detail = e.reason || '';
          if (rules) detail += (detail ? ' · ' : '') + rules;
          add(stamp(e.timestamp), i18nT('evidence.step.policy') + ' — ' + (e.decision || ''), detail);
        });
        if (!events.length) {
          var li = el('li', 'step');
          li.appendChild(el('span', 'ic', '·'));
          li.appendChild(el('span', 'mut', i18nT('evidence.noPolicyEvents')));
          list.appendChild(li);
        }
        add('', i18nT('evidence.step.approval'), state);
        if (o.paypalCaptureId) {
          add(stamp(o.updatedAt), i18nT('evidence.step.captured'), maskId(o.paypalCaptureId));
        }
      }
      var wrap = el('div', '');
      wrap.appendChild(list);
      var rules = ruleList(p);
      if (rules) wrap.appendChild(rules);
      return wrap;
    }
    function fmtVal(v) {
      if (v === null || v === undefined) return '—';
      if (Array.isArray(v)) return v.join(', ');
      return String(v);
    }
    // Priority 1: per-rule detail (which rule fired, expected vs actual).
    function ruleList(p) {
      var rows = [];
      (p.policyEvents || []).forEach(function (e) {
        (e.ruleDetails || []).forEach(function (r) { rows.push(r); });
      });
      if (!rows.length) return null;
      var box = el('div', '');
      box.appendChild(el('div', 'mut', i18nT('evidence.rule.title')));
      var ul = el('ul', 'ritems');
      rows.forEach(function (r) {
        var li = el('li', '');
        li.appendChild(el('span', '', (r.type || '') + ' (' + (r.rule || '') + ')'));
        li.appendChild(el('span', '', i18nT('evidence.rule.expected') + ' ' + fmtVal(r.expected) + ' · ' + i18nT('evidence.rule.actual') + ' ' + fmtVal(r.actual)));
        ul.appendChild(li);
      });
      box.appendChild(ul);
      return box;
    }
    // Priority 1: auto-generated dispute-defense statement (download as .txt,
    // printable to PDF from any browser).
    function disputeDefense(p) {
      var d = p.disputeDefense;
      if (!d) return null;
      var box = el('div', '');
      box.appendChild(el('div', 'who-t', i18nT('evidence.dispute.title')));
      if (d.keyFacts && d.keyFacts.length) {
        var ul = el('ul', 'ritems');
        d.keyFacts.forEach(function (f) {
          var li = el('li', '');
          li.appendChild(el('span', '', f));
          ul.appendChild(li);
        });
        box.appendChild(ul);
      }
      var btn = el('button', '', i18nT('evidence.dispute.download')); btn.type = 'button';
      btn.onclick = function () {
        var blob = new Blob([d.narrative || ''], { type: 'text/plain' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = 'aicafe-dispute-defense-' + p.orderId + '.txt';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      };
      box.appendChild(btn);
      box.appendChild(el('div', 'mut', i18nT('evidence.dispute.note')));
      return box;
    }
    function evidenceSources(p) {
      var items = Array.isArray(p.evidenceItems) ? p.evidenceItems : [];
      if (!items.length) return null;
      var box = el('div', '');
      var records = items.filter(function (item) { return item.source === 'record'; });
      var narratives = items.filter(function (item) { return item.source !== 'record'; });
      if (records.length) {
        box.appendChild(el('div', 'who-t', i18nT('evidence.records.title')));
        var list = el('ul', 'ritems');
        records.forEach(function (item) {
          var li = el('li', '');
          li.appendChild(el('span', '', item.label || ''));
          var detail = String(item.detail || '').replace(/\b(Capture\s+)([A-Za-z0-9_-]+)/gi, function (_m, prefix, id) { return prefix + maskId(id); });
          li.appendChild(el('span', '', detail));
          list.appendChild(li);
        });
        box.appendChild(list);
      }
      narratives.forEach(function (item) {
        var section = el('div', 'policy');
        section.appendChild(el('b', '', i18nT('evidence.narrative.title')));
        if (item.detail) section.appendChild(el('p', 'mut', item.detail));
        box.appendChild(section);
      });
      return box;
    }
    function integrity(p) {
      var box = el('div', '');
      var i = p.integrity || {};
      box.appendChild(el('div', '', i18nT('evidence.integrity') + ': ' + (i.alg || '—') + ' · key ' + (i.kid || '—')));
      box.appendChild(el('div', 'mut', i18nT('evidence.digest') + ': ' + short(i.digest)));
      box.appendChild(el('div', 'mut', i18nT('evidence.canonicalization') + ': ' + (i.canonicalization || '—')));
      return box;
    }
    // Independent verification: anyone (no session) can check the signed package.
    function verify(p) {
      var vbtn = el('button', '', i18nT('evidence.verify')); vbtn.type = 'button';
      var vout = el('div', 'mut'); vout.setAttribute('aria-live', 'polite');
      vbtn.onclick = function () {
        vbtn.disabled = true; vout.textContent = i18nT('evidence.verifying');
        api('/api/evidence/verify', { method: 'POST', body: JSON.stringify(p), auth: false }).then(function (v) {
          vout.textContent = '';
          var ok = v.valid === true;
          vout.appendChild(el('div', ok ? 'okline' : 'badline', (ok ? '✓ ' : '✗ ') + (ok ? i18nT('evidence.valid') : i18nT('evidence.invalid'))));
          var c = v.checks || {};
          [['evidence.check.signature', c.signature], ['evidence.check.digest', c.digest], ['evidence.check.mandate', c.mandateValid], ['evidence.check.order', c.matchesOrder]].forEach(function (pair) {
            vout.appendChild(el('div', '', i18nT(pair[0]) + ': ' + (pair[1] === true ? 'yes' : 'no')));
          });
          if (v.reason) vout.appendChild(el('div', 'mut', v.reason));
          vbtn.disabled = false;
        }).catch(function (e) { vout.textContent = i18nT('evidence.error') + e.message; vbtn.disabled = false; });
      };
      var box = el('div', '');
      box.appendChild(vbtn); box.appendChild(vout);
      return box;
    }
    function download(p) {
      var dbtn = el('button', '', i18nT('evidence.download')); dbtn.type = 'button';
      dbtn.onclick = function () {
        var blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = 'aicafe-evidence-' + p.orderId + '.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      };
      var box = el('div', '');
      box.appendChild(dbtn);
      box.appendChild(el('div', 'mut', i18nT('evidence.exportNote')));
      return box;
    }
    open.onclick = function () {
      open.disabled = true; out.textContent = i18nT('evidence.loading');
      api('/api/orders/' + encodeURIComponent(orderId) + '/evidence').then(function (p) {
        out.textContent = '';
        out.appendChild(el('div', 'who-t', i18nT('evidence.passport')));
        out.appendChild(passport(p));
        var dd = disputeDefense(p);
        if (dd) out.appendChild(dd);
        var sources = evidenceSources(p);
        if (sources) out.appendChild(sources);
        out.appendChild(integrity(p));
        out.appendChild(verify(p));
        out.appendChild(download(p));
        open.disabled = false;
      }).catch(function (e) {
        out.textContent = i18nT('evidence.error') + e.message;
        open.disabled = false;
      });
    };
    wrap.appendChild(open);
    wrap.appendChild(out);
    return wrap;
  }
  // E-invoice: itemised, printable record that carries the Cart Mandate QR so a
  // third party can verify the signed mandate without trusting this page.
  function invoiceBlock(orderId, d) {
    var wrap = el('div', 'invoice');
    wrap.appendChild(el('h4', '', i18nT('invoice.title')));
    var rows = el('ul', 'invoice-rows');
    (d.items || []).forEach(function (it) {
      var li = el('li', '');
      li.appendChild(el('span', '', it.qty + '× ' + it.name));
      li.appendChild(el('span', '', it.price || ''));
      rows.appendChild(li);
    });
    wrap.appendChild(rows);
    var kv = el('div', 'invoice-kv');
    kv.appendChild(el('p', '', i18nT('receipt.total') + ' ' + (d.totalText || '')));
    kv.appendChild(el('p', '', i18nT('invoice.orderRef') + ' ' + (d.orderId || '—')));
    kv.appendChild(el('p', '', i18nT('receipt.date') + ' ' + fmtDate(new Date(d.createdAt))));
    if (d.maskedId) kv.appendChild(el('p', '', i18nT('receipt.captureId') + ' ' + d.maskedId));
    wrap.appendChild(kv);
    wrap.appendChild(qrBlock(orderId));
    var printBtn = el('button', '', i18nT('invoice.print')); printBtn.type = 'button';
    printBtn.onclick = function () { try { window.print(); } catch (e) { /* graceful */ } };
    wrap.appendChild(printBtn);
    return wrap;
  }
  function renderReceipt(d) {
    var box = $('order-detail'); if (!box) return;
    box.textContent = '';
    box.hidden = false;
    box.classList.add('order-detail');
    if (d.source === 'local') {
      box.appendChild(el('div', 'policy', i18nT('order.localOnly')));
    } else {
      box.appendChild(el('div', 'mut', i18nT('order.sourceRecord')));
    }
    box.appendChild(el('p', 'mut', i18nT('receipt.date') + ' ' + fmtDate(new Date(d.createdAt))));
    var statusKey = 'order.status.' + d.status;
    var statusText = d.status && i18nT(statusKey) !== statusKey ? i18nT(statusKey) : (d.status || '—');
    box.appendChild(el('p', 'mut', i18nT('order.status') + ': ' + statusText));
    if (d.refunds && d.refunds.length) {
      box.appendChild(el('p', 'mut', i18nT('order.refundStatus') + ': ' + d.refunds.map(function (refund) {
        return i18nT('refund.status.' + ({
          UNDER_REVIEW: 'review', BEING_PROCESSED: 'processing', REFUNDED: 'refunded', DECLINED: 'declined'
        }[refund.status] || 'review'));
      }).join(', ')));
    }
    var receipt = el('div', 'receipt'); box.appendChild(receipt);
    receipt.appendChild(el('h3', '', i18nT('receipt.title')));
    receipt.appendChild(el('p', 'mut', i18nT('receipt.status') + (d.status || '—')));
    if (d.items && d.items.length) {
      var ul = el('ul', 'ritems');
      d.items.forEach(function (it) {
        var qty = it.qty !== undefined ? it.qty : it.quantity;
        var price = it.price !== undefined ? it.price : eur(it.lineTotalMinor);
        var li = el('li', ''); li.appendChild(el('span', '', qty + '× ' + it.name)); li.appendChild(el('span', '', price));
        ul.appendChild(li);
      });
      receipt.appendChild(ul);
    }
    receipt.appendChild(el('div', 'rtotal', i18nT('receipt.total') + (d.totalText || d.totalFormatted || '')));
    if (d.maskedId) receipt.appendChild(el('div', 'rmask', i18nT('receipt.captureId') + d.maskedId));
    if (d.orderId && d.items && d.items.length && d.source !== 'local') { try { receipt.appendChild(invoiceBlock(d.orderId, d)); } catch (e) { /* optional */ } }
    // Who did what: makes the AI / human split visible. The AI row appears only when an assistant prepared the cart.
    var who = el('div', 'who');
    who.appendChild(el('div', 'who-t', i18nT('who.title')));
    var whoRow = function (icon, text) { var r = el('div', 'who-r'); r.appendChild(el('span', 'who-i', icon)); r.appendChild(el('span', '', text)); who.appendChild(r); };
    if (d.source !== 'local') {
      if (d.origin === 'AI_ASSISTED' || d.origin === 'AI_AGENT') whoRow('🤖', i18nT('who.ai'));
      whoRow('🧑', i18nT('who.you'));
      whoRow('🔒', i18nT('who.cannot'));
      receipt.appendChild(who);
    }
    if (d.orderId && d.source !== 'local') receipt.appendChild(mandateBlock(d.orderId));
    if (d.orderId && d.source !== 'local') receipt.appendChild(evidenceBlock(d.orderId));
    // The refund request is an optional extra: it must never stop the receipt from rendering.
    if (d.orderId && d.source !== 'local') { try { receipt.appendChild(refundBlock(d.orderId)); } catch (e) { /* receipt still shown */ } }
    // The customer-facing receipt must NOT expose the merchant Control Center:
    // a buyer never sees the café's ops dashboard. (Removed the /dashboard.html link.)
    var print = el('button', '', i18nT('order.print')); print.type = 'button';
    print.onclick = function () { window.print(); }; box.appendChild(print);
    // Notify the app shell so it can record the paid order in this-browser history
    // (read-only mirror; the receipt itself does not depend on it).
    if (d.orderId && d.source !== 'local') {
      try {
        var histItems = (d.items || []).map(function (it) { return { qty: it.qty !== undefined ? it.qty : it.quantity, name: it.name, price: it.price || eur(it.lineTotalMinor) }; });
        window.dispatchEvent(new CustomEvent('aicafe:receipt', {
          detail: { at: d.createdAt || new Date().toISOString(), orderId: d.orderId, totalText: d.totalText || d.totalFormatted || '', maskedId: d.maskedId || '', decision: d.decision, status: d.status || 'COMPLETED', items: histItems }
        }));
      } catch (e) { /* history is best-effort */ }
    }
  }
  function openOrder(orderId) {
    var box = $('order-detail'); if (!box) return;
    box.textContent = i18nT('order.loading');
    api('/api/orders/customer/' + encodeURIComponent(orderId)).then(function (response) {
      var order = response.order;
      if (!order || order.id !== orderId || !Array.isArray(order.items)) throw new Error(i18nT('order.notFound'));
      var data = {
        orderId: order.id,
        createdAt: order.createdAt,
        status: order.status,
        origin: order.origin,
        totalText: order.totalFormatted,
        totalMinor: order.totalMinor,
        currency: order.currency,
        refunds: order.refunds || [],
        source: 'server',
        items: order.items.map(function (item) {
          return {
            qty: item.quantity, quantity: item.quantity, name: item.name,
            price: eur(item.lineTotalMinor), lineTotalMinor: item.lineTotalMinor,
            productId: item.productId
          };
        })
      };
      renderReceipt(data);
    }).catch(function (e) {
      if (window.AiCafeShell && window.AiCafeShell.findLocalOrder) {
        var local = window.AiCafeShell.findLocalOrder(orderId);
        if (local) { showLocalOrder(local); return; }
      }
      box.textContent = '';
      box.appendChild(el('p', 'policy BLOCK', e.status === 404 ? i18nT('order.notFound') : i18nT('order.receiptUnavailable') + ' ' + e.message));
      var retry = el('button', 'secondary', i18nT('order.refresh')); retry.type = 'button';
      retry.onclick = function () { openOrder(orderId); };
      box.appendChild(retry);
    });
  }
  function showLocalOrder(order) {
    renderReceipt({
      source: 'local',
      orderId: order && order.orderId,
      createdAt: order && (order.at || order.createdAt),
      status: order && order.status,
      totalText: order && order.totalText,
      items: order && order.items || []
    });
  }
  function reset() {
    clearTimeout(ptimer); pseq++; previewLoading = false;
    cart = {}; save(CKEY, cart); drop(PKEY); drop(SPKEY); drop(SCOPEKEY);
    selectedScopeId = null; scopeValidated = true; scopeReady = true; policy = null; policyError = null;
    lastPrepared = null; cartSource = null; impactByOrder = {};
    pickup.booking = null; drop(BKEY);
    var r = $('order-detail'); if (r) r.textContent = '';
    $('split-modal').hidden = true; split.busy = false;
    var b = $('banner'); if (b) { b.hidden = true; b.textContent = ''; }
    policy = null; $('policy').textContent = ''; $('policy-note').textContent = '';
    $('scope-select').value = ''; scopeNotice = ''; renderScopes();
    var modal = $('reset-modal'); if (modal) modal.hidden = true;
    setCartChrome(true); renderCart(); renderPickup();
    var log = $('log'); if (log) log.textContent = '';
    say('s', i18nT('reset.done'));
    var resetButton = $('reset'); if (resetButton) resetButton.focus();
  }
  function openResetDialog() {
    var modal = $('reset-modal'); if (!modal) return;
    $('reset-pending-warning').hidden = !load(PKEY);
    modal.hidden = false; $('reset-cancel').focus();
  }
  function closeResetDialog() {
    $('reset-modal').hidden = true;
    $('reset').focus();
  }
  // Exposed for headless verification only; not used by the normal flow.
  function loadOrders() {
    return api('/api/orders/customer').then(function (response) {
      if (!response || !Array.isArray(response.orders)) throw new Error('The server returned an invalid order list.');
      return response.orders;
    });
  }
  window.AICAFE = window.AICAFE || {};
  window.AICAFE.renderReceipt = renderReceipt;
  window.AICAFE.openOrder = openOrder;
  window.AICAFE.showLocalOrder = showLocalOrder;
  window.AICAFE.loadOrders = loadOrders;
  window.AICAFE.reset = openResetDialog;

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

  // Shopper concerns are sent only to the authenticated Wellbeing contract; no diagnosis or free text is collected.
  var ALLERGENS = [
    { k: 'gluten', en: 'Gluten', tr: 'Gluten' },
    { k: 'dairy', en: 'Dairy', tr: 'Süt' },
    { k: 'tree-nut', en: 'Tree nuts', tr: 'Fındık / ceviz' },
    { k: 'peanut', en: 'Peanuts', tr: 'Yer fıstığı' },
    { k: 'soy', en: 'Soy', tr: 'Soya' },
    { k: 'egg', en: 'Egg', tr: 'Yumurta' },
    { k: 'fish', en: 'Fish', tr: 'Balık' },
    { k: 'shellfish', en: 'Shellfish', tr: 'Kabuklu deniz ürünü' }
  ];
  function allergenLabel(a) { return (window.i18n && window.i18n.lang === 'tr') ? a.tr : a.en; }
  function loadAllergens() { return savedProfile.allergens.slice(); }
  function renderAllergenChips() {
    var box = $('allergen-chips'); if (!box) return; box.textContent = '';
    var sel = draftProfile.allergens || [];
    ALLERGENS.forEach(function (a) {
      var on = sel.indexOf(a.k) >= 0;
      var b = el('button', 'allergen-chip' + (on ? ' on' : ''), allergenLabel(a)); b.type = 'button';
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.onclick = function () {
        var s = draftProfile.allergens.slice(); var i = s.indexOf(a.k);
        if (i >= 0) s.splice(i, 1); else s.push(a.k);
        draftProfile.allergens = s; renderAllergenChips(); readProfileDraft(); renderProfileStatus();
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
    scheduleWellbeing();
  }

  // ---- Wellbeing check (server-authoritative) ------------------------------------------------
  // The server evaluates each selected sensitivity against merchant-provided menu
  // data. The UI never collapses that into "safe / suitable": ingredient facts and
  // cross-contact are shown separately, and missing data stays visibly missing.
  var wbTimer = null, wbSeq = 0;
  function scheduleWellbeing() { clearTimeout(wbTimer); wbTimer = setTimeout(refreshWellbeing, 250); }
  function wbDiets() { return prefs().dietary; }
  function i18nF(k, vars) {
    var s = i18nT(k);
    Object.keys(vars || {}).forEach(function (name) { s = s.split('{' + name + '}').join(vars[name]); });
    return s;
  }
  function wbRestrictionLabel(restriction) {
    var key = String(restriction).split(':').pop() || restriction;
    var label = i18nT('wb.r.' + key);
    return label === 'wb.r.' + key ? key : label;
  }
  // Older deployments only returned conflicts/missing. Reconstruct per-restriction
  // facts from them so the raw "UNKNOWN / Missing information: ..." copy can never
  // leak into the interface again.
  function wbFacts(it) {
    if (it.facts && it.facts.length) return it.facts;
    var out = [];
    (it.conflicts || []).forEach(function (c) {
      out.push({ restriction: c.restriction, status: 'CONFLICT', ingredients: c.ingredients || [] });
    });
    (it.missing || []).forEach(function (m) {
      out.push({ restriction: m, status: 'UNKNOWN', ingredients: [] });
    });
    return out;
  }
  function refreshWellbeing() {
    var box = $('wellbeing'); if (!box) return;
    var ids = Object.keys(cart), dietary = wbDiets(), allergens = loadAllergens();
    if (!ids.length || (!dietary.length && !allergens.length)) { box.hidden = true; box.textContent = ''; return; }
    var seq = ++wbSeq;
    syncWellbeing().then(function () { return api('/api/wellbeing/check', { method: 'POST', body: JSON.stringify({ items: ids.map(function (id) { return { productId: id, quantity: cart[id] }; }) }) }); })
     .then(function (r) { if (seq === wbSeq) renderWellbeing(r, dietary, allergens); })
     .catch(function (e) { try { if (seq === wbSeq) renderWellbeing(e.body && e.body.wellbeing, dietary, allergens, true); } catch (ignored) { /* page gone */ } });
  }
  function renderWellbeing(r, dietary, allergens, failed) {
    var box = $('wellbeing'); if (!box) return; // page already torn down
    box.textContent = ''; box.hidden = false;
    var h = el('h4', '');
    h.appendChild(el('span', '', i18nT('wb.title')));
    h.appendChild(el('span', 'wb-badge', i18nT('wb.badge')));
    box.appendChild(h);

    // 1) The sensitivities the shopper actually selected (never inferred).
    var checkedKeys = (r && r.checked && r.checked.length)
      ? r.checked.map(function (c) { return c.key; })
      : [].concat(dietary || [], allergens || []);
    var checkedNames = checkedKeys.map(wbRestrictionLabel).filter(function (v, i, a) { return a.indexOf(v) === i; });
    var checked = el('div', 'wb-checked');
    checked.appendChild(el('b', '', i18nT('wb.checked') + ': '));
    checked.appendChild(document.createTextNode(checkedNames.join(', ')));
    checked.appendChild(el('small', '', i18nT('wb.checkedHint')));
    box.appendChild(checked);

    if (!r) {
      box.appendChild(el('p', 'wb-no', i18nT('wb.unavailable')));
      if (failed) box.appendChild(el('p', 'wb-note', i18nT('wb.unavailable.detail')));
      return;
    }
    if (r.status && r.status !== 'NO_KNOWN_CONFLICT') box.appendChild(el('p', 'wb-headline', i18nT('wb.heading')));

    // 2) One result block per product, with one line per checked sensitivity.
    var list = el('ul', 'wb-items');
    (r.items || []).forEach(function (it) {
      var li = el('li', 'wb-item');
      var state = it.status === 'CONFIRMED_CONFLICT' ? 'conflict' : it.status === 'UNKNOWN' ? 'unknown' : 'clear';
      var head = el('div', 'wb-item-head');
      head.appendChild(el('span', 'wb-item-name', it.quantity + ' × ' + it.name));
      head.appendChild(el('span', 'wb-state wb-state-' + state, i18nT('wb.state.' + state)));
      li.appendChild(head);

      wbFacts(it).forEach(function (f) {
        var label = wbRestrictionLabel(f.restriction);
        var text;
        if (f.status === 'CONFLICT') {
          text = (f.ingredients && f.ingredients.length)
            ? i18nF('wb.fact.conflict', { r: label, list: f.ingredients.join(', ') })
            : i18nF('wb.fact.conflict.noList', { r: label });
        } else if (f.status === 'UNKNOWN') {
          text = i18nF('wb.fact.unknown', { r: label });
        } else {
          text = i18nF('wb.fact.clear', { r: label });
        }
        li.appendChild(el('div', 'wb-fact wb-fact-' + String(f.status).toLowerCase(), text));
      });
      // Cross-contact is deliberately a separate line: no merchant data = no claim.
      li.appendChild(el('div', 'wb-cross', i18nT('wb.crossContact')));

      // 3) Safe next steps — rendered ONLY when the action really works.
      var actions = el('div', 'wb-actions');
      if (state !== 'clear') {
        var qty = cart[it.productId] || it.quantity || 1;
        var remove = el('button', 'wb-action', i18nT('wb.action.remove'));
        remove.type = 'button';
        remove.onclick = function () { setQty(it.productId, 0); };
        actions.appendChild(remove);
        var alt = (r.alternatives || [])[0];
        if (alt && alt.productId && catalog[alt.productId]) {
          var replace = el('button', 'wb-action', i18nF('wb.action.replace', { name: alt.name }));
          replace.type = 'button';
          replace.onclick = function () {
            setQty(it.productId, 0);
            setQty(alt.productId, (cart[alt.productId] || 0) + qty);
          };
          actions.appendChild(replace);
        }
      }
      if (actions.childNodes.length) {
        actions.insertBefore(el('span', 'wb-actions-label', i18nT('wb.next') + ': '), actions.firstChild);
        li.appendChild(actions);
      }
      list.appendChild(li);
    });
    box.appendChild(list);

    // 4) Source, data version and limits — no fabricated "last updated" date.
    var src = el('div', 'wb-source');
    src.appendChild(el('p', '', i18nT('wb.source')));
    var version = (r.source && r.source.dataVersion) || r.productDataVersion;
    if (version) src.appendChild(el('p', 'wb-version', i18nF('wb.sourceVersion', { v: String(version).slice(0, 8) })));
    src.appendChild(el('p', '', i18nT('wb.limit')));
    box.appendChild(src);

    if (r.alternatives && r.alternatives.length) {
      box.appendChild(el('p', 'wb-alt', i18nF('wb.alternatives', {
        names: r.alternatives.slice(0, 4).map(function (a) { return a.name; }).join(', ')
      })));
    }
  }

  function syncWellbeing() {
    var aliases = { nuts: 'tree-nut', peanuts: 'peanut' };
    var allergens = loadAllergens().map(function (a) { return aliases[a] || a; });
    return api('/api/wellbeing/preferences', { method: 'PUT', body: JSON.stringify({ preferences: { dietary: prefs().dietary, allergens: allergens } }) });
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
    renderScopes();
    refreshQuickReplies();
    renderSplitActive();
    if ($('split-modal') && !$('split-modal').hidden) { renderSplitPeople(); renderSplitPreview(); }
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
    session = load(SKEY); cart = load(CKEY) || {};
    initI18n();
    syncProfileControls();
    renderCoco();
    renderAllergenChips();
    renderChips();
    renderProfileStatus();
    renderScopes();
    $('chat-form').addEventListener('submit', function (e) { e.preventDefault(); ask($('msg').value); });
    $('diet').addEventListener('change', function () {
      var select = $('diet');
      var any = Array.from(select.selectedOptions).some(function (option) { return option.value === ''; });
      if (any) Array.from(select.options).forEach(function (option) { option.selected = option.value === ''; });
      else Array.from(select.options).forEach(function (option) { if (option.value === '') option.selected = false; });
      onProfileChange();
    });
    $('budget').addEventListener('input', onProfileChange);
    $('save-preferences').addEventListener('click', savePreferences);
    $('discard-preferences').addEventListener('click', discardProfileDraft);
    $('scope-select').addEventListener('change', function () {
      selectedScopeId = this.value || null;
      scopeValidated = true; scopeReady = true; scopeNotice = ''; policyError = null;
      if (selectedScopeId) save(SCOPEKEY, selectedScopeId); else drop(SCOPEKEY);
      renderScopeCheckoutNotice(); renderSplitActive(); schedulePolicy();
    });
    $('pay').addEventListener('click', pay);
    initSplit();
    $('reset').addEventListener('click', openResetDialog);
    $('reset-confirm').addEventListener('click', reset);
    $('reset-cancel').addEventListener('click', closeResetDialog);
    $('reset-modal').addEventListener('click', function (e) { if (e.target === this) closeResetDialog(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('reset-modal').hidden) closeResetDialog(); });
    say('a', i18nT('agent.greeting'));
    fetch('/api/health').then(function (r) { return r.json(); }).then(function (h) {
      lastHealth = h; updateStatusPills();
    }).catch(function () { /* badges stay neutral */ });
    fetch('/api/catalog').then(function (r) { return r.json(); }).then(function (c) { renderCatalog(c.products || []); renderScenarios(); renderCart(); handleReturn(); })
      .catch(function () { banner('bad', 'Could not load the menu. Is the API running?'); });
    renderCart();
    renderPickup();
    if (!session) ensureSession().catch(function () { /* retried on first request */ });
    initOnboarding();
  }
  boot();
})();
