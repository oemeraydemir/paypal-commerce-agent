(function () {
  'use strict';
  var root = document.getElementById('opsCopilot');
  if (!root) return;
  var KEY_STORE = 'aicafe.opsKey';
  var EXAMPLES = [
    'Which payments were blocked by policy today, and why?',
    'Compare AI-prepared orders with human orders',
    'List recent PayPal transactions',
    'Refund my last order'
  ];

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function getKey() { try { return sessionStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; } }
  function setKey(v) { try { sessionStorage.setItem(KEY_STORE, v); } catch (e) { /* storage unavailable */ } }

  function render(status) {
    root.textContent = '';
    var head = el('div', 'ops-head');
    head.appendChild(el('h2', '', 'Ops Copilot'));
    head.appendChild(el('span', 'ops-badge', 'read-only · PayPal Agent Toolkit'));
    root.appendChild(head);

    if (!status.enabled) {
      root.appendChild(el('p', 'ops-muted', status.reason || 'Ops Copilot is disabled on this server.'));
      root.appendChild(el('p', 'ops-muted', 'Enable it with OPS_COPILOT_ENABLED=true and OPS_COPILOT_KEY (16+ characters).'));
      return;
    }

    root.appendChild(el('p', 'ops-muted', 'Ask about PayPal sandbox activity and the policy audit trail. The copilot cannot move money: it only has read permissions (' + status.paypalTools.length + ' PayPal tools + ' + status.internalTools.length + ' audit tools).'));

    var keyRow = el('div', 'ops-row');
    var key = el('input'); key.type = 'password'; key.placeholder = 'Ops access key'; key.autocomplete = 'off'; key.value = getKey();
    key.setAttribute('aria-label', 'Ops access key'); key.addEventListener('change', function () { setKey(key.value); });
    keyRow.appendChild(key); root.appendChild(keyRow);

    var form = el('form', 'ops-row');
    var q = el('input'); q.type = 'text'; q.maxLength = 500; q.placeholder = 'Ask the Ops Copilot…'; q.setAttribute('aria-label', 'Question');
    var go = el('button', 'ops-btn', 'Ask'); go.type = 'submit';
    form.appendChild(q); form.appendChild(go); root.appendChild(form);

    var chips = el('div', 'ops-chips');
    EXAMPLES.forEach(function (t) { var b = el('button', 'ops-chip', t); b.type = 'button'; b.onclick = function () { q.value = t; q.focus(); }; chips.appendChild(b); });
    root.appendChild(chips);

    var out = el('div', 'ops-out'); out.setAttribute('aria-live', 'polite'); root.appendChild(out);

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var question = q.value.trim(); if (question.length < 3) return;
      setKey(key.value); go.disabled = true; go.textContent = 'Thinking…'; out.textContent = '';
      fetch('/api/ops/ask', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Ops-Key': key.value }, body: JSON.stringify({ question: question }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, status: r.status, body: b }; }); })
        .then(function (r) {
          if (!r.ok) {
            var msg = r.status === 401 ? 'The access key was not accepted.' : (r.body && (r.body.message || r.body.error)) || ('Request failed (' + r.status + ')');
            out.appendChild(el('div', 'ops-err', msg)); return;
          }
          out.appendChild(el('div', 'ops-answer', r.body.answer));
          var used = el('div', 'ops-tools');
          (r.body.toolsUsed || []).forEach(function (t) { used.appendChild(el('span', 'ops-tool ' + t.source + (t.ok ? '' : ' fail'), t.name + (t.source === 'rejected' ? ' (refused: read-only)' : ''))); });
          if (!used.childNodes.length) used.appendChild(el('span', 'ops-muted', 'No tools were needed.'));
          out.appendChild(used);
        })
        .catch(function () { out.appendChild(el('div', 'ops-err', 'Could not reach the server.')); })
        .then(function () { go.disabled = false; go.textContent = 'Ask'; });
    });
  }

  fetch('/api/ops/status').then(function (r) { return r.json(); }).then(render)
    .catch(function () { root.textContent = ''; });
})();
