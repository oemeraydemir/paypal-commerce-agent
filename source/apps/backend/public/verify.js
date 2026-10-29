/* AI Café — public verification page for a signed Cart Mandate (opened from the receipt QR code).
 * The link is /verify.html#<orderId>.<signature>. The part after # is never sent to any server log;
 * this script sends it in the body of POST /api/mandates/public (so it never appears in a request log),
 * which checks the Ed25519 signature server-side. Nothing is rendered as HTML: every value goes through textContent. */
(function () {
  'use strict';
  var TR = (navigator.language || '').toLowerCase().indexOf('tr') === 0;
  var S = TR ? {
    sub: 'İmzalı Cart Mandate doğrulaması', checking: 'Kontrol ediliyor…', ok: '✓ İmza geçerli', bad: '✗ Geçerli değil',
    notfound: 'Bu bağlantı geçerli bir mandate göstermiyor.', fail: 'Doğrulama yapılamadı: ', order: 'Kayıtlı siparişle eşleşiyor: ',
    yes: 'evet', no: 'hayır', agent: 'Yapay zeka ödeme yetkisi verebilir mi: ', auth: 'Ödeme yetkisi: ', human: 'PayPal’da alıcı onayı',
    total: 'Toplam', key: 'Anahtar', id: 'Mandate no', origin: 'Kaynak', expired: 'Mandate süresi dolmuş (imza yine de gerçek).'
  } : {
    sub: 'Signed Cart Mandate check', checking: 'Checking…', ok: '✓ Signature valid', bad: '✗ Not valid',
    notfound: 'This link does not point to a valid mandate.', fail: 'Could not verify: ', order: 'Matches the stored order: ',
    yes: 'yes', no: 'no', agent: 'AI may authorize payment: ', auth: 'Payment authority: ', human: 'buyer approval at PayPal',
    total: 'Total', key: 'Key', id: 'Mandate id', origin: 'Origin', expired: 'The mandate window has passed (the signature is still genuine).'
  };
  var out = document.getElementById('out');
  document.getElementById('sub').textContent = S.sub;
  out.textContent = S.checking;
  function add(text, cls) { var d = document.createElement('div'); d.className = cls || 'row'; d.textContent = text; out.appendChild(d); return d; }
  function money(minor, cur) {
    try { return new Intl.NumberFormat(TR ? 'tr-TR' : 'en-IE', { style: 'currency', currency: cur || 'EUR' }).format(minor / 100); }
    catch (e) { return (minor / 100).toFixed(2) + ' ' + (cur || ''); }
  }
  var m = /^#([A-Za-z0-9_-]{1,100})\.([A-Za-z0-9_-]{20,200})$/.exec(location.hash || '');
  if (!m) { out.textContent = ''; add(S.notfound, 'verdict bad'); return; }
  fetch('/api/mandates/public', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: m[1], signature: m[2] }), cache: 'no-store', referrerPolicy: 'no-referrer' })
    .then(function (r) {
      if (r.status === 404) { out.textContent = ''; add(S.notfound, 'verdict bad'); return null; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (d) {
      if (!d) return;
      var mand = d.signed.mandate, v = d.verification, c = mand.constraints;
      out.textContent = '';
      add(v.valid ? S.ok : S.bad, 'verdict ' + (v.valid ? 'ok' : 'bad'));
      var ul = document.createElement('ul');
      mand.items.forEach(function (it) {
        var li = document.createElement('li');
        var a = document.createElement('span'); a.textContent = it.quantity + '× ' + it.productId;
        var b = document.createElement('span'); b.textContent = money(it.lineTotalMinor, mand.currency);
        li.appendChild(a); li.appendChild(b); ul.appendChild(li);
      });
      out.appendChild(ul);
      add(S.total + ': ' + money(mand.totalMinor, mand.currency), 'row');
      add(S.order + (v.checks && v.checks.matchesOrder === true ? S.yes : S.no));
      add(S.agent + (c.agentMayAuthorizePayment ? S.yes : S.no));
      add(S.auth + (c.paymentAuthority === 'buyer_approval_at_paypal' ? S.human : String(c.paymentAuthority).replace(/_/g, ' ')));
      add(S.key + ': ' + d.signed.kid + ' · ' + S.origin + ': ' + mand.origin + ' · ' + S.id + ': ' + mand.mandateId, 'row');
      if (v.checks && v.checks.notExpired === false) add(S.expired, 'row');
    })
    .catch(function (e) { out.textContent = ''; add(S.fail + e.message, 'verdict bad'); });
})();
