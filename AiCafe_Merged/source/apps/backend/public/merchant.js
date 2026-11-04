(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function num(id) { var v = parseFloat($(id).value); return isFinite(v) && v >= 0 ? v : 0; }
  function eur(n) { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(n); } catch (e) { return '€' + n.toFixed(2); } }
  function row(label, text, cls) {
    var li = document.createElement('li');
    var a = document.createElement('span'); a.textContent = label;
    var b = document.createElement('span'); b.className = cls; b.textContent = text;
    li.appendChild(a); li.appendChild(b); return li;
  }

  // ---- Readiness: read from the real /api/health, never invented ----
  fetch('/api/health', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (h) {
    var ul = $('ready'); ul.textContent = '';
    var pp = h.paypal || {}, ai = h.ai || {}, st = h.storage || {}, mn = h.mandates || {}, au = h.automation || {};
    ul.appendChild(row('PayPal credentials configured', pp.enabled ? 'yes' : 'no', pp.enabled ? 'on' : 'off'));
    ul.appendChild(row('PayPal environment', String(pp.environment || 'sandbox') + ' (live money not possible)', 'na'));
    ul.appendChild(row('AI provider', ai.enabled ? 'enabled (' + (ai.providers || []).join(', ') + ')' : 'none: rule-based planner', ai.enabled ? 'on' : 'na'));
    ul.appendChild(row('Durable storage', st.durable ? 'PostgreSQL' : 'in-memory (lost on restart)', st.durable ? 'on' : 'off'));
    ul.appendChild(row('Mandate signing key', mn.keyPersistence === 'configured' ? 'configured' : String(mn.keyPersistence || 'unknown'), mn.keyPersistence === 'configured' ? 'on' : 'na'));
    ul.appendChild(row('Automation webhook (Zapier/n8n/Make)', au.configured ? 'configured' : 'not configured', au.configured ? 'on' : 'na'));
    $('ready-note').textContent = 'Source: GET /api/health at ' + new Date().toLocaleTimeString() + '. Nothing here is a PayPal account verification.';
  }).catch(function () {
    $('ready').textContent = '';
    $('ready').appendChild(row('Server health', 'unreachable', 'off'));
  });

  // ---- Calculator: plain arithmetic on the owner's own inputs ----
  function calc() {
    var orders = num('c-orders') * num('c-days'), gross = orders * num('c-aov');
    var fees = gross * num('c-pct') / 100 + orders * num('c-fix');
    var refunded = gross * num('c-ref') / 100;
    var out = $('calc'); out.textContent = '';
    [['Orders / month', String(Math.round(orders))], ['Gross sales', eur(gross)], ['Estimated PayPal fees', eur(fees)],
     ['Fees as % of sales', gross ? (fees / gross * 100).toFixed(2) + '%' : '–'], ['Refunded (approved by you)', eur(refunded)],
     ['Net after fees and refunds', eur(gross - fees - refunded)]].forEach(function (p) {
      var d = document.createElement('div'), s = document.createElement('strong');
      s.textContent = p[1]; d.appendChild(document.createTextNode(p[0])); d.appendChild(s); out.appendChild(d);
    });
  }
  ['c-orders', 'c-aov', 'c-days', 'c-pct', 'c-fix', 'c-ref'].forEach(function (id) { $(id).addEventListener('input', calc); });
  calc();
})();
