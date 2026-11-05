(function () {
  'use strict';
  var root = document.getElementById('refundQueue');
  if (!root) return;
  var KEY_STORE = 'aicafe.opsKey'; // same merchant key the Ops Copilot panel uses

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function getKey() { try { return sessionStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; } }
  function setKey(v) { try { sessionStorage.setItem(KEY_STORE, v); } catch (e) { /* storage unavailable */ } }
  function money(minor, cur) { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(minor / 100); } catch (e) { return (minor / 100).toFixed(2) + ' ' + cur; } }

  var key, list, status;

  function api(path, method) {
    return fetch('/api/refunds' + path, { method: method || 'GET', headers: { 'X-Ops-Key': key.value } })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, status: r.status, body: b }; }); });
  }
  function say(msg, isErr) { status.textContent = msg; status.className = 'refund-status' + (isErr ? ' refund-err' : ''); }

  function decide(id, action, btns) {
    btns.forEach(function (b) { b.disabled = true; });
    say(action === 'approve' ? 'Asking PayPal to issue the refund…' : 'Rejecting…');
    api('/' + encodeURIComponent(id) + '/' + action, 'POST').then(function (r) {
      if (r.ok) say(action === 'approve' ? 'Refund issued in PayPal sandbox.' : 'Refund request rejected.');
      else say((r.body && (r.body.message || r.body.error)) || ('Request failed (' + r.status + ')'), true);
      load();
    }).catch(function () { say('Could not reach the server.', true); btns.forEach(function (b) { b.disabled = false; }); });
  }

  function row(r) {
    var li = el('li', 'refund-item');
    var head = el('div', 'refund-line');
    head.appendChild(el('strong', '', money(r.amountMinor, r.currency)));
    head.appendChild(el('span', 'refund-state refund-' + r.status.toLowerCase(), r.status));
    head.appendChild(el('span', 'ops-muted', 'requested by ' + (r.proposedBy === 'OPS_COPILOT' ? 'Ops Copilot (AI)' : r.proposedBy === 'CUSTOMER' ? 'customer' : 'merchant')));
    li.appendChild(head);
    li.appendChild(el('div', 'ops-muted', 'Order ' + r.orderId.slice(0, 8) + '… · reason: ' + r.reason));
    if (r.lastError) li.appendChild(el('div', 'refund-err', r.lastError));
    if (r.paypalRefundId) li.appendChild(el('div', 'ops-muted', 'PayPal refund ' + r.paypalRefundId + (r.paypalRefundStatus ? ' (' + r.paypalRefundStatus + ')' : '')));
    // Dispute Evidence Pack for this order (signed; includes the refund steps recorded so far).
    var evBox = el('pre', 'ops-muted'); evBox.hidden = true; evBox.style.cssText = 'white-space:pre-wrap;max-height:280px;overflow:auto;margin:8px 0';
    var evBtn = el('button', 'ops-chip', 'Evidence'); evBtn.type = 'button';
    evBtn.setAttribute('aria-label', 'Show the evidence pack for this order');
    evBtn.onclick = function () {
      if (!evBox.hidden) { evBox.hidden = true; return; }
      evBtn.disabled = true;
      api('/' + encodeURIComponent(r.id) + '/evidence').then(function (res) {
        if (!res.ok) { say((res.body && (res.body.message || res.body.error)) || ('Request failed (' + res.status + ')'), true); return; }
        var dd = res.body.disputeDefense || {};
        evBox.textContent = dd.narrative || JSON.stringify(res.body.timeline || [], null, 2);
        evBox.hidden = false;
      }).catch(function () { say('Could not reach the server.', true); }).then(function () { evBtn.disabled = false; });
    };
    var evRow = el('div', 'refund-actions'); evRow.appendChild(evBtn); li.appendChild(evRow); li.appendChild(evBox);
    if (r.status === 'PROPOSED') {
      var actions = el('div', 'refund-actions');
      var ok = el('button', 'ops-btn', 'Approve & refund'); ok.type = 'button';
      var no = el('button', 'ops-chip', 'Reject'); no.type = 'button';
      ok.setAttribute('aria-label', 'Approve refund of ' + money(r.amountMinor, r.currency));
      no.setAttribute('aria-label', 'Reject refund of ' + money(r.amountMinor, r.currency));
      ok.onclick = function () { decide(r.id, 'approve', [ok, no]); };
      no.onclick = function () { decide(r.id, 'reject', [ok, no]); };
      actions.appendChild(ok); actions.appendChild(no); li.appendChild(actions);
    }
    return li;
  }

  function load() {
    if (!key.value) { list.textContent = ''; say('Enter the merchant key to see the refund queue.'); return; }
    api('').then(function (r) {
      list.textContent = '';
      if (!r.ok) { say(r.status === 401 ? 'The access key was not accepted.' : (r.body && (r.body.message || r.body.error)) || ('Request failed (' + r.status + ')'), true); return; }
      var items = r.body.refunds || [];
      say(items.length ? items.length + ' refund request(s). Only an approval here moves money.' : 'No refund requests yet. Ask the Ops Copilot to refund an order — it can only propose.');
      items.forEach(function (it) { list.appendChild(row(it)); });
    }).catch(function () { say('Could not reach the server.', true); });
  }

  var head = el('div', 'ops-head');
  head.appendChild(el('h2', '', 'Refund queue'));
  head.appendChild(el('span', 'ops-badge', 'AI proposes · merchant approves'));
  root.appendChild(head);
  key = el('input'); key.type = 'password'; key.placeholder = 'Ops access key'; key.autocomplete = 'off'; key.value = getKey();
  key.setAttribute('aria-label', 'Merchant access key for the refund queue');
  key.addEventListener('change', function () { setKey(key.value); load(); });
  root.appendChild(key);
  var refresh = el('button', 'ops-chip', 'Refresh'); refresh.type = 'button'; refresh.onclick = function () { setKey(key.value); load(); };
  root.appendChild(refresh);
  status = el('p', 'refund-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); root.appendChild(status);
  list = el('ul', 'refund-list'); root.appendChild(list);
  load();
})();
