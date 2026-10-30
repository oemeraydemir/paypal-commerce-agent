/* AI Café — Split Bill room.
 *
 * One page for the organiser (`/split#b=<billId>`) and for guests (`/join#t=<invite>`).
 * Everything that matters is decided by the SERVER: the shares, who may pay which share,
 * whether an invite is still valid, and when the bill counts as settled. This page only
 * renders that state and calls the same session-authenticated API as the rest of the app.
 *
 * Security notes
 *  - The invite token lives in the URL fragment (never sent to a server log) and is
 *    removed from the address bar right after it is redeemed.
 *  - A QR code contains only the signed, single-use, 1-hour invite link. Never a session.
 *  - All dynamic text is written with textContent; nothing is injected as HTML.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var SKEY = 'aicafe.session', SPKEY = 'aicafe.split.active', PKEY = 'aicafe.pending', CKEY = 'aicafe.cart';
  var POLL_MS = 4000, POLL_ERR_MS = 8000, INVITE_MAX_AGE_MS = 50 * 60 * 1000;

  var session = null, sessionPromise = null;
  var billId = null, bill = null, returning = false;
  var pollTimer = null, lastOpen = null, invite = null, busy = {};

  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  function drop(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  function sload(k) { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function ssave(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  function t(k) { return (window.i18n && window.i18n.t) ? window.i18n.t(k) : k; }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function locale() { return (window.i18n && window.i18n.lang === 'tr') ? 'tr-TR' : 'en-IE'; }
  function money(minor, currency) {
    try { return new Intl.NumberFormat(locale(), { style: 'currency', currency: currency || 'EUR' }).format(minor / 100); }
    catch (e) { return (minor / 100).toFixed(2) + ' ' + (currency || 'EUR'); }
  }

  // ---- session + API (same contract as the storefront) ---------------------------------------
  function newSession() {
    return fetch('/api/sessions', { method: 'POST' }).then(function (r) {
      if (!r.ok) throw new Error('Could not start a session (' + r.status + ')');
      return r.json();
    }).then(function (s) { session = { id: s.sessionId, token: s.sessionToken }; save(SKEY, session); return session; });
  }
  function ensureSession() {
    if (session) return Promise.resolve(session);
    if (!sessionPromise) sessionPromise = newSession().finally(function () { sessionPromise = null; });
    return sessionPromise;
  }
  function api(path, opts, retried) {
    opts = opts || {};
    var send = function (tried) {
      var headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
      if (session) { headers['X-Session-Id'] = session.id; headers['Authorization'] = 'Bearer ' + session.token; }
      return fetch(path, Object.assign({}, opts, { headers: headers })).then(function (r) {
        if (r.status === 401 && !tried) { session = null; drop(SKEY); return ensureSession().then(function () { return send(true); }); }
        return r.json().catch(function () { return {}; }).then(function (body) {
          if (!r.ok) {
            var e = new Error(body.error || body.message || ('Request failed (' + r.status + ')'));
            e.status = r.status; e.body = body; e.code = body.details && body.details.code;
            throw e;
          }
          return body;
        });
      });
    };
    return ensureSession().then(function () { return send(!!retried); });
  }

  // ---- hash handling -------------------------------------------------------------------------
  function parseHash() {
    var h = (location.hash || '').replace(/^#/, '');
    var out = {};
    h.split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('=');
      var k = i < 0 ? kv : kv.slice(0, i);
      var v = i < 0 ? '' : kv.slice(i + 1);
      try { out[k] = decodeURIComponent(v); } catch (e) { out[k] = v; }
    });
    return out;
  }
  function setHash(id, keepReturn) {
    history.replaceState(null, '', '/split#b=' + encodeURIComponent(id) + (keepReturn ? '&return=1' : ''));
  }

  // ---- status line -----------------------------------------------------------------------------
  var statusTransient = false;
  // `transient` messages (loading / connection retry) are cleared by the next successful poll;
  // everything else (e.g. a failed capture) stays until the shopper acts again.
  function status(kind, text, transient) {
    var box = $('status'); box.textContent = ''; statusTransient = !!transient && !!text;
    if (!text) return;
    box.appendChild(el('div', 'msg ' + (kind || ''), text));
  }

  // ---- derived view state ----------------------------------------------------------------------
  function shareState(s) {
    if (!s.participantBound) return 'open';
    if (s.status === 'PAID') return 'paid';
    if (s.status === 'FAILED') return 'failed';
    if (s.orderId) return 'started';
    return 'joined';
  }
  var STATE_LABEL = { open: 'share.open', joined: 'share.joined', started: 'share.started', paid: 'share.paid', failed: 'share.failed' };
  function mineShare() { return bill && bill.shares.filter(function (s) { return s.mine; })[0]; }
  function openSlots() { return bill ? bill.shares.filter(function (s) { return !s.participantBound; }).length : 0; }
  function anyMoney() { return bill && bill.shares.some(function (s) { var st = shareState(s); return st === 'paid' || st === 'started'; }); }
  function terminal() { return bill && (bill.status === 'SETTLED' || bill.status === 'CANCELLED'); }

  // ---- join ------------------------------------------------------------------------------------
  function joinErrorText(e) {
    var m = (e && e.message || '').toLowerCase();
    if (m.indexOf('already used') >= 0) return t('room.joinUsed');
    if (m.indexOf('full') >= 0) return t('room.joinFull');
    if (m.indexOf('cancel') >= 0) return t('room.joinCancelled');
    if (m.indexOf('expired') >= 0 || m.indexOf('invalid') >= 0 || m.indexOf('malformed') >= 0) return t('room.joinBad');
    return t('room.joinFailed') + (e && e.message || '');
  }
  function join(token) {
    status('', t('room.joining'), true);
    // Remove the token from the address bar immediately: it is single-use and must not linger.
    history.replaceState(null, '', '/split');
    api('/api/bills/join', { method: 'POST', body: JSON.stringify({ token: token }) }).then(function (r) {
      billId = r.bill.id; save(SPKEY, { billId: billId }); setHash(billId);
      bill = r.bill; status('', ''); onBill(); render(); schedulePoll();
    }).catch(function (e) {
      // Already a participant (e.g. a reload on the same device): resume the saved bill.
      var saved = load(SPKEY);
      if (saved && saved.billId) {
        billId = saved.billId; setHash(billId);
        return refresh(true).then(function () { if (!bill) status('bad', joinErrorText(e)); });
      }
      status('bad', joinErrorText(e));
    });
  }

  // ---- load + poll -----------------------------------------------------------------------------
  function refresh(first) {
    if (!billId) return Promise.resolve();
    return api('/api/bills/' + encodeURIComponent(billId)).then(function (b) {
      bill = b; if (statusTransient) status('', ''); onBill(); render();
    }).catch(function (e) {
      if (e.status === 404) { bill = null; drop(SPKEY); $('room').textContent = ''; status('bad', t('room.notFound')); return; }
      if (first && !bill) status('bad', t('room.refreshFailed'), true); else status('warn', t('room.refreshFailed'), true);
      throw e;
    });
  }
  function onBill() {
    if (bill.status === 'SETTLED') {
      drop(SPKEY);
      if (bill.isOwner) { drop(CKEY); }
      var p = load(PKEY); if (p && p.billId === bill.id) drop(PKEY);
    }
    if (bill.status === 'CANCELLED') drop(SPKEY);
    // Someone joined: rotate the organiser's QR so it never shows an already-used invitation.
    var open = openSlots();
    if (lastOpen !== null && open < lastOpen) { invite = null; clearStoredInvite(); }
    lastOpen = open;
  }
  function schedulePoll(delay) {
    clearTimeout(pollTimer);
    if (terminal()) return;
    pollTimer = setTimeout(function () {
      if (document.hidden) { schedulePoll(POLL_MS); return; }
      refresh().then(function () { schedulePoll(POLL_MS); }).catch(function () { schedulePoll(POLL_ERR_MS); });
    }, delay || POLL_MS);
  }

  // ---- invite (organiser) ----------------------------------------------------------------------
  function inviteKey() { return 'aicafe.split.invite.' + billId; }
  function clearStoredInvite() { try { sessionStorage.removeItem(inviteKey()); } catch (e) { /* ignore */ } }
  function ensureInvite(force) {
    if (!bill || !bill.isOwner || terminal() || openSlots() === 0) return;
    if (invite && !force) return;
    if (!force) {
      var stored = sload(inviteKey());
      if (stored && stored.url && Date.now() - stored.at < INVITE_MAX_AGE_MS) { invite = stored; render(); return; }
    }
    if (busy.invite) return;
    if (!force && busy.inviteFailed) return; // never auto-retry a failed mint in a render loop
    busy.inviteFailed = false; busy.invite = true; render();
    api('/api/bills/' + encodeURIComponent(billId) + '/invite', { method: 'POST', body: '{}' }).then(function (r) {
      invite = { url: location.origin + '/join#t=' + encodeURIComponent(r.token), at: Date.now() };
      ssave(inviteKey(), invite);
    }).catch(function (e) {
      busy.inviteFailed = true; status('bad', t('room.inviteFailed') + e.message);
    }).then(function () { busy.invite = false; render(); });
  }
  function qrImage(url) {
    try {
      if (typeof qrcode !== 'function') return null;
      var q = qrcode(0, 'M'); q.addData(url); q.make();
      var img = document.createElement('img');
      img.src = q.createDataURL(5, 4); img.alt = t('room.scan');
      img.width = img.height = q.getModuleCount() * 5 + 8;
      return img;
    } catch (e) { return null; }
  }
  function copyText(text, btn) {
    var done = function () { var old = btn.textContent; btn.textContent = t('room.copied'); setTimeout(function () { btn.textContent = old; }, 1800); };
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); }); }
    else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { /* ignore */ } document.body.removeChild(ta);
  }

  // ---- payment ---------------------------------------------------------------------------------
  function payMine() {
    var s = mineShare(); if (!s || busy.pay) return;
    busy.pay = true; status('', t('room.paying')); render();
    api('/api/bills/' + encodeURIComponent(billId) + '/shares/' + encodeURIComponent(s.id) + '/pay', { method: 'POST', body: '{}' }).then(function (r) {
      if (!r.approvalUrl) throw new Error('PayPal approval link unavailable, please retry shortly.');
      save(PKEY, { orderId: r.orderId, paypalOrderId: r.paypalOrderId, total: money(r.totalMinor, r.currency), billId: billId, shareId: s.id });
      window.location.assign(r.approvalUrl);
    }).catch(function (e) {
      busy.pay = false;
      if (e.status === 503) status('bad', t('room.noPayPal'));
      else if (e.status === 403) status('bad', t('room.payFailed') + ((e.body && (e.body.reason || e.body.suggestion)) || e.message));
      else status('bad', t('room.payFailed') + e.message);
      render();
    });
  }
  function pendingCapture() {
    var p = load(PKEY), s = mineShare();
    return (p && s && p.billId === billId && p.shareId === s.id && shareState(s) !== 'paid') ? p : null;
  }
  function capture(p) {
    if (busy.capture) return;
    busy.capture = true; status('', t('room.capturing')); render();
    api('/api/orders/' + encodeURIComponent(p.orderId) + '/capture', { method: 'POST', body: '{}' }).then(function (r) {
      busy.capture = false; returning = false; setHash(billId);
      // Only a completed capture closes the pending marker; an uncertain result stays visible.
      if (!r || !r.status || String(r.status).toUpperCase() === 'COMPLETED' || r.status === 'PAID') drop(PKEY);
      status('', '');
      return refresh().catch(function () { /* the poll will retry */ });
    }).catch(function (e) {
      busy.capture = false;
      // Never claim "failed" for an uncertain outcome: the share is verified server-side.
      status('warn', t('room.captureFailed') + e.message + ' — ' + t('room.verifying'));
      render();
    });
  }

  // ---- cancel (organiser) ----------------------------------------------------------------------
  function cancelBill() {
    if (busy.cancel || !window.confirm(t('room.cancelConfirm'))) return;
    busy.cancel = true; render();
    api('/api/bills/' + encodeURIComponent(billId) + '/cancel', { method: 'POST', body: '{}' }).then(function (b) {
      bill = b; onBill();
    }).catch(function (e) { status('bad', t('room.cancelFailed') + e.message); })
      .then(function () { busy.cancel = false; render(); });
  }

  // ---- rendering -------------------------------------------------------------------------------
  function render() {
    var root = $('room'); root.textContent = '';
    if (!bill) return;
    var cur = bill.currency;

    if (bill.status === 'SETTLED') {
      var ok = el('section', 'success');
      ok.appendChild(el('div', 'tick', '✅')); ok.appendChild(el('h2', '', t('room.settled')));
      ok.appendChild(el('div', 'big', money(bill.totalMinor, cur)));
      root.appendChild(ok);
    } else if (bill.status === 'CANCELLED') {
      root.appendChild(el('div', 'msg warn', t('room.cancelled')));
    }

    // Summary + progress
    var sum = el('section');
    var head = el('div', 'kv'); head.appendChild(el('span', 'mut', t('room.total'))); head.appendChild(el('span', 'big', money(bill.totalMinor, cur)));
    sum.appendChild(head);
    var meter = el('div', 'meter'); meter.setAttribute('role', 'progressbar');
    var pct = bill.progress.sharesTotal ? Math.round(100 * bill.progress.sharesPaid / bill.progress.sharesTotal) : 0;
    meter.setAttribute('aria-valuenow', String(pct)); meter.setAttribute('aria-valuemin', '0'); meter.setAttribute('aria-valuemax', '100');
    var fill = el('div'); fill.style.width = pct + '%'; meter.appendChild(fill); sum.appendChild(meter);
    sum.appendChild(el('div', 'mut', bill.progress.sharesPaid + ' / ' + bill.progress.sharesTotal + ' ' + t('room.progress')));
    var items = el('ul', 'items'); items.setAttribute('aria-label', t('room.items'));
    bill.items.forEach(function (i) {
      var li = el('li'); li.appendChild(el('span', '', i.quantity + ' × ' + i.name)); li.appendChild(el('span', 'mut', money(i.lineTotalMinor, cur))); items.appendChild(li);
    });
    sum.appendChild(el('h2', '', t('room.items'))); sum.appendChild(items);
    root.appendChild(sum);

    // Shares: "joined" and "paid" are separate states on purpose.
    var sh = el('section'); sh.appendChild(el('h2', '', t('room.shares')));
    bill.shares.forEach(function (s, idx) {
      var st = shareState(s);
      var row = el('div', 'share' + (s.mine ? ' mine' : ''));
      var left = el('div');
      var name = s.mine ? t('room.you') : (idx === 0 && bill.isOwner === false ? t('room.organiser') : t('room.person') + ' ' + (idx + 1));
      left.appendChild(el('div', 'who', name));
      left.appendChild(el('span', 'chip ' + st, t(STATE_LABEL[st])));
      row.appendChild(left); row.appendChild(el('div', 'amt', money(s.amountMinor, cur)));
      sh.appendChild(row);
    });
    root.appendChild(sh);

    if (terminal()) { root.appendChild(backLink()); return; }

    // My share
    var mine = mineShare();
    if (mine) {
      var box = el('section'); box.appendChild(el('h2', '', t('room.mineHeading')));
      box.appendChild(el('div', 'big', money(mine.amountMinor, cur)));
      var ms = shareState(mine), pend = pendingCapture();
      if (ms === 'paid') {
        box.appendChild(el('p', 'mut', t('room.minePaid')));
        if (!terminal()) box.appendChild(el('p', 'mut', t('room.waiting')));
      } else {
        if (pend && returning) {
          box.appendChild(el('p', 'mut', t('room.captureHint')));
          var cb = el('button', 'primary full', busy.capture ? t('room.capturing') : t('room.capture')); cb.type = 'button'; cb.disabled = !!busy.capture;
          cb.onclick = function () { capture(pend); }; box.appendChild(cb);
        }
        if (ms !== 'failed' && !(pend && returning)) {
        var pb = el('button', ((pend && returning) ? '' : 'primary ') + 'full', busy.pay ? t('room.paying') : (mine.orderId ? t('room.payResume') : t('room.payMine')));
        pb.type = 'button'; pb.style.marginTop = '8px'; pb.disabled = !!busy.pay || !!busy.capture;
        if (busy.pay) { pb.classList.add('loading'); pb.setAttribute('aria-busy', 'true'); }
        pb.onclick = payMine; box.appendChild(pb);
        }
      }
      root.appendChild(box);
    }

    // Organiser tools: QR invite + cancel
    if (bill.isOwner) {
      if (openSlots() > 0) {
        var inv = el('section'); inv.appendChild(el('h2', '', t('room.inviteHeading')));
        inv.appendChild(el('p', 'mut', t('room.inviteHint')));
        var card = el('div', 'invite');
        if (invite) {
          var img = qrImage(invite.url); if (img) card.appendChild(img);
          card.appendChild(el('div', 'mut', t('room.scan')));
          var row2 = el('div', 'row');
          var copy = el('button', '', t('room.copy')); copy.type = 'button'; copy.onclick = function () { copyText(invite.url, copy); };
          row2.appendChild(copy);
          if (navigator.share) {
            var sb = el('button', '', t('room.shareLink')); sb.type = 'button';
            sb.onclick = function () { navigator.share({ title: t('room.title'), url: invite.url }).catch(function () { /* dismissed */ }); };
            row2.appendChild(sb);
          }
          var again = el('button', '', t('room.inviteBtn')); again.type = 'button'; again.disabled = !!busy.invite;
          again.onclick = function () { ensureInvite(true); };
          row2.appendChild(again);
          card.appendChild(row2);
        } else {
          var mk = el('button', 'primary', busy.invite ? t('split.creating') : t('room.inviteBtn')); mk.type = 'button'; mk.disabled = !!busy.invite;
          mk.onclick = function () { ensureInvite(true); }; card.appendChild(mk);
        }
        inv.appendChild(card); root.appendChild(inv);
      }
      if (!anyMoney()) {
        var cn = el('button', 'danger full', busy.cancel ? '…' : t('room.cancelBill')); cn.type = 'button'; cn.disabled = !!busy.cancel;
        cn.onclick = cancelBill; root.appendChild(cn);
      }
    }
    root.appendChild(backLink());
    ensureInvite(false);
  }
  function backLink() { var a = el('a', '', t('room.back')); a.href = '/'; a.style.display = 'block'; a.style.textAlign = 'center'; a.style.margin = '6px 0 18px'; return a; }

  // ---- boot ------------------------------------------------------------------------------------
  function boot() {
    if (window.i18n) {
      i18n.applyStatic();
      var sel = $('lang'); if (sel) { sel.value = i18n.lang; sel.addEventListener('change', function () { i18n.setLang(this.value); }); }
      i18n.onChange = function () { document.documentElement.lang = i18n.lang; render(); };
      document.documentElement.lang = i18n.lang;
    }
    session = load(SKEY);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && bill && !terminal()) { schedulePoll(300); } });
    var h = parseHash();
    returning = h['return'] === '1';
    if (h.t) { join(h.t); return; }
    billId = h.b || (load(SPKEY) || {}).billId || null;
    if (!billId) { status('bad', t('room.notFound')); return; }
    status('', t('room.loading'), true);
    refresh(true).then(function () { schedulePoll(); }).catch(function () { schedulePoll(POLL_ERR_MS); });
  }
  // Scripts are deferred in order (i18n, qr, split), so i18n and qrcode exist here.
  boot();
})();
