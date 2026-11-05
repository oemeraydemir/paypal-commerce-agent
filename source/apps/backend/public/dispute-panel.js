(function () {
  'use strict';
  var root = document.getElementById('disputePanel');
  if (!root) return;
  var KEY_STORE = 'aicafe.opsKey'; // the merchant key entered in the Ops Copilot / refund panels

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function getKey() { try { return sessionStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; } }

  var list, status, orderIn, reasonIn;

  function call(path, method, body) {
    var headers = { 'X-Ops-Key': getKey() };
    if (body) headers['Content-Type'] = 'application/json';
    return fetch('/api/disputes' + path, { method: method || 'GET', headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, status: r.status, body: b }; }); });
  }
  function say(msg, isErr) { status.textContent = msg; status.className = 'refund-status' + (isErr ? ' refund-err' : ''); }
  function fail(r) { say((r.body && (r.body.message || r.body.error)) || ('Request failed (' + r.status + ')'), true); }

  function act(path, body, okMsg) {
    call(path, 'POST', body || {}).then(function (r) { if (r.ok) { say(okMsg); load(); } else fail(r); })
      .catch(function () { say('Could not reach the server.', true); });
  }

  function download(id, name) {
    call('/' + encodeURIComponent(id) + '/evidence').then(function (r) {
      if (!r.ok) { fail(r); return; }
      var blob = new Blob([JSON.stringify(r.body, null, 2)], { type: 'application/json' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }).catch(function () { say('Could not reach the server.', true); });
  }

  function chip(label, fn, cls) { var b = el('button', cls || 'ops-chip', label); b.type = 'button'; b.onclick = fn; return b; }

  function row(d) {
    var li = el('li', 'refund-item');
    var head = el('div', 'refund-line');
    head.appendChild(el('strong', '', 'Order ' + d.orderId.slice(0, 8) + '…'));
    head.appendChild(el('span', 'refund-state refund-' + (d.status === 'RESOLVED' ? 'refunded' : d.status === 'EXPIRED' || d.status === 'WITHDRAWN' ? 'rejected' : 'proposed'), d.status.replace('_', ' ')));
    li.appendChild(head);
    li.appendChild(el('div', 'ops-muted', 'Reason: ' + d.reason));
    if (d.paypalDisputeId) li.appendChild(el('div', 'ops-muted', 'PayPal dispute id (entered by you): ' + d.paypalDisputeId));
    if (d.deadline) li.appendChild(el('div', 'ops-muted', 'Response deadline: ' + new Date(d.deadline).toLocaleString()));
    if (d.evidence) li.appendChild(el('div', 'ops-muted', 'Evidence v' + d.evidence.versionCount + ' · SHA-256 ' + d.evidence.sha256.slice(0, 16) + '…'));
    if (d.submission) li.appendChild(el('div', 'ops-muted', 'Submission attested by the merchant at ' + new Date(d.submission.at).toLocaleString()));
    if (d.resolution) li.appendChild(el('div', 'ops-muted', 'Outcome: ' + d.resolution.outcome.replace(/_/g, ' ').toLowerCase()));
    var acts = el('div', 'refund-actions');
    if (d.status === 'OPEN' || d.status === 'EVIDENCE_READY') {
      acts.appendChild(chip(d.status === 'OPEN' ? 'Build evidence' : 'Rebuild evidence', function () { act('/' + d.id + '/evidence', null, 'Evidence package built and fingerprinted.'); }, 'ops-btn'));
    }
    if (d.status === 'EVIDENCE_READY' || d.status === 'SUBMITTED' || d.status === 'RESOLVED') {
      acts.appendChild(chip('Export evidence (JSON)', function () { download(d.id, 'dispute-' + d.orderId.slice(0, 8) + '.json'); }));
    }
    if (d.status === 'EVIDENCE_READY') {
      acts.appendChild(chip('I submitted it in PayPal', function () {
        var id = window.prompt('Enter the PayPal dispute id where you submitted the evidence (this app does not submit anything itself):');
        if (id) act('/' + d.id + '/submitted', { paypalDisputeId: id }, 'Recorded as submitted by you.');
      }));
    }
    if (d.status === 'SUBMITTED') {
      [['WON', 'Won'], ['LOST', 'Lost'], ['ACCEPTED_CLAIM', 'Accepted claim'], ['REFUNDED_CUSTOMER', 'Refunded customer']].forEach(function (o) {
        acts.appendChild(chip('Outcome: ' + o[1], function () { act('/' + d.id + '/resolve', { outcome: o[0] }, 'Outcome recorded.'); }));
      });
    }
    if (d.status === 'OPEN' || d.status === 'EVIDENCE_READY') acts.appendChild(chip('Withdraw', function () { act('/' + d.id + '/withdraw', {}, 'Case file closed without submitting.'); }));
    li.appendChild(acts);
    return li;
  }

  function load() {
    if (!getKey()) { list.textContent = ''; say('Enter the merchant key in the panel above to see dispute case files.'); return; }
    call('').then(function (r) {
      list.textContent = '';
      if (!r.ok) { fail(r); return; }
      var items = r.body.disputes || [];
      if (!items.length) { say('No dispute case files yet. Open one for a paid order when a customer disputes a payment.'); return; }
      say(items.length + ' case file' + (items.length === 1 ? '' : 's') + '.');
      items.forEach(function (d) { list.appendChild(row(d)); });
    }).catch(function () { say('Could not reach the server.', true); });
  }

  function paypalLook() {
    call('/paypal').then(function (r) {
      if (!r.ok) { fail(r); return; }
      var b = r.body;
      say(b.available ? ('PayPal (read-only): ' + b.items.length + ' dispute(s) on this merchant account.') : ('PayPal disputes unavailable: ' + b.reason), !b.available);
    }).catch(function () { say('Could not reach the server.', true); });
  }

  function build() {
    var head = el('div', 'ops-head');
    head.appendChild(el('h2', '', 'Disputes'));
    head.appendChild(el('span', 'ops-badge', 'merchant-controlled'));
    root.appendChild(head);
    root.appendChild(el('p', 'ops-muted', 'Case files for disputed payments: OPEN → EVIDENCE READY → SUBMITTED → RESOLVED. The app prepares a fingerprinted evidence package; YOU submit it in PayPal and record it here. Nothing is sent to PayPal automatically.'));
    var form = el('div', 'ops-row');
    orderIn = el('input'); orderIn.type = 'text'; orderIn.placeholder = 'Paid order id'; orderIn.setAttribute('aria-label', 'Paid order id');
    reasonIn = el('input'); reasonIn.type = 'text'; reasonIn.placeholder = 'Reason (e.g. item not received)'; reasonIn.setAttribute('aria-label', 'Dispute reason');
    form.appendChild(orderIn); form.appendChild(reasonIn);
    form.appendChild(chip('Open case file', function () {
      call('', 'POST', { orderId: orderIn.value.trim(), reason: reasonIn.value.trim() }).then(function (r) {
        if (r.ok) { orderIn.value = ''; reasonIn.value = ''; say('Case file opened.'); load(); } else fail(r);
      }).catch(function () { say('Could not reach the server.', true); });
    }, 'ops-btn'));
    form.appendChild(chip('Check PayPal (read-only)', paypalLook));
    form.appendChild(chip('Refresh', load));
    root.appendChild(form);
    status = el('p', 'ops-muted refund-status', ''); status.setAttribute('role', 'status');
    root.appendChild(status);
    list = el('ul', 'refund-list');
    root.appendChild(list);
    load();
  }
  build();
})();
