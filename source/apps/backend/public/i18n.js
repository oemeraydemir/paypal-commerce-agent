/* AI Café — lightweight EN/TR internationalization for the storefront.
 *
 * No build step, no framework. Strings are stored as keyed dictionaries and
 * applied to elements that carry a `data-i18n` attribute. Dynamic strings
 * (built in app.js) call `i18n.t(key)`. Missing keys fall back to English so
 * the UI never breaks when a translation is absent.
 *
 * Language choice is detected from an explicit saved value, then the browser
 * language, and persisted in localStorage. Switching language does NOT reload
 * the page — static text is re-applied and app.js re-renders dynamic parts
 * through `i18n.onChange`.
 */
(function () {
  'use strict';

  var DICT = {
    en: {
      'options.hint': 'Choose an option below or reply with its number. Review the cart before checkout.',
      'options.select': 'Choose option',
      'tagline': 'Shop by intent. Review every item. Approve every payment.',
      'ask.heading': 'Ask the café agent',
      'chat.placeholder': 'e.g. A vegetarian breakfast for two under €20',
      'profile.label': 'Shopper profile:',
      'profile.applied': 'Next message will use:',
      'profile.none': 'No diet or budget filter',
      'diet.any': 'any diet',
      'diet.vegetarian': 'vegetarian',
      'diet.vegan': 'vegan',
      'diet.gluten-free': 'gluten-free',
      'budget.placeholder': 'max budget €',
      'send': 'Send',
      'cart.heading': 'Your cart',
      'cart.empty': 'Your cart is empty. Ask the agent or add items from the menu.',
      'pay.review': 'Review & pay with PayPal',
      'pay.blocked': 'Blocked by your policy',
      'reset': 'Reset demo',
      'payNote': 'The agent can prepare a cart. Only you can authorize payment, in PayPal sandbox.',
      'scenario.heading': 'Try a scenario',
      'scenario.note': 'One click fills the cart. The decision you see comes from the server-side policy engine, not from this page.',
      'menu.heading': 'Menu',
      'category.all': 'All',
      'add': 'Add',
      'footer': 'Hackathon prototype · PayPal sandbox only · no real money moves. Dietary labels are informational, not an allergen guarantee.',
      'lang.label': 'Language',
      'agent.searching': 'Agent is searching the menu…',
      'agent.ruleBased': 'Rule-based planner (no AI) — the cart below is still priced and checked by the server.',
      'suggest.hint': 'This is over your budget, but you can still add it yourself, or type a new request.',
      'suggest.add': 'Add to cart anyway:',
      'suggest.added': 'Added to your cart. Review it, then pay with PayPal when you are ready.',
      'agent.aiBusy': 'The AI is at capacity right now. Try again in a minute, or use the menu.',
      'agent.notConfigured': 'The AI is not configured on this server (no AI provider key). You can still use the menu.',
      'agent.error': 'Error: ',
      'checkout.contacting': 'Contacting PayPal…',
      'checkout.noLink': 'PayPal did not return an approval link',
      'checkout.cancelled': 'Checkout cancelled. Nothing was charged.',
      'checkout.mismatch': 'This PayPal return does not match an order from this browser, so nothing was captured.',
      'checkout.notConfigured': 'PayPal is not configured on this server.',
      'checkout.failed': 'Checkout failed: ',
      'receipt.approved': 'PayPal approved your ',
      'receipt.confirm': 'Confirm payment',
      'receipt.capturing': 'Capturing…',
      'receipt.title': 'Payment receipt',
      'receipt.status': 'Status: ',
      'receipt.total': 'Total paid: ',
      'receipt.captureId': 'PayPal capture ID: ',
      'receipt.controlCenter': 'Open the Agent Control Center',
      'decision.autoAllow.short': 'Within your limits',
      'decision.confirm.short': 'Needs your approval',
      'decision.block.short': 'Blocked by your policy',
      'decision.autoAllow.long': 'Checkout needs no extra confirmation.',
      'decision.confirm.long': 'You must explicitly approve this payment on PayPal.',
      'decision.block.long': 'The server will refuse this cart before PayPal is contacted.',
      'policy.enforced': 'enforced by server',
      'policy.dailyBudget': 'Daily budget ',
      'policy.dailyLeft': ' left). Add items to see the live policy decision.',
      'why.title': 'Why these items?',
      'why.none': 'No server explanation was provided for this cart.',
      'allergy.title': 'Allergy notice',
      'allergy.core': 'This shop does not publish allergen data, so no item can be confirmed safe or allergen-free.',
      'allergy.unverified': 'Allergy information is unverified. ',
      'allergy.concerns.prefix': 'Allergy information is unverified — including your noted concern(s): ',
      'allergy.concerns.local': ' Allergen preferences are stored locally and are not filtered server-side.',
      'prefs.allergenLabel': 'Allergen concerns (noted locally)',
      'prefs.dietLabel': 'Dietary preferences',
      'onboarding.title': 'Welcome to AI Café',
      'onboarding.coco': 'Coco is the AI barista. It reads your request, searches the menu and prepares a priced cart — but it can never move your money. You approve every payment in PayPal (sandbox).',
      'onboarding.explain': 'When Coco prepares a cart it shows a short "Why these items?" note built only from the server response, so you can see the reasoning and the policy verdict.',
      'onboarding.allergy': 'Allergy information is always shown as UNVERIFIED. The shop publishes no allergen data and Coco cannot confirm any item is safe.',
      'onboarding.gotit': 'Got it',
      'onboarding.again': 'Show the welcome help again',
      'agent.greeting': 'Hi! Tell me what you need and what you want to spend. I prepare the cart; you approve the payment.',
      'agent.noAnswer': '(no answer)',
      'status.aiReady': 'AI ready',
      'status.aiOff': 'AI not configured',
      'status.ppReady': 'PayPal',
      'status.ppOff': 'PayPal not configured',
      'chip.1': 'Vegetarian breakfast for two under €20',
      'chip.2': 'A birthday treat for a friend',
      'chip.3': 'Coffee and a snack, max €10',
      'reset.done': 'Demo reset — cart and pending order cleared.',
      'policy.limits': 'Your policy limits',
      'policy.approvalAbove': 'approval above',
      'policy.max': 'max',
      'receipt.approvedContinue': ' order. Confirm to complete the payment.',
      'receipt.step.cart': 'Cart prepared',
      'receipt.step.policy': 'Policy decision',
      'receipt.step.paypal': 'Approved at PayPal',
      'receipt.step.captured': 'Captured',
      'who.title': 'Who did what',
      'who.ai': 'Coco (AI) prepared the cart',
      'who.rule': 'Rule-based planner (no AI) prepared the cart',
      'who.you': 'You approved and paid on PayPal',
      'who.cannot': 'The AI cannot authorize or move money',
      'receipt.date': 'Date: ',
      'scenario.everyday': 'Everyday order',
      'scenario.quick': 'Quick coffee',
      'scenario.overLimit': 'Over the limit',
      'scenario.team': 'Team order',
      'scenario.alcohol': 'Alcohol request',
      'hint.needsApproval': 'needs your approval',
      'hint.autoAllowed': 'auto-allowed',
      'hint.blocked': 'blocked',
      'hint.blockedRule': 'blocked by rule'
    },
    tr: {
      'options.hint': 'Aşağıdan bir seçenek seçin veya numarasını yazın. Ödemeden önce sepeti inceleyin.',
      'options.select': 'Seçenek seç',
      'tagline': 'Niyete göre alışveriş · Her ürünü incele · Her ödemeyi onayla.',
      'ask.heading': 'Kafe asistanına sor',
      'chat.placeholder': 'Örn. İki kişilik vejetaryen kahvaltı, 20 € altı',
      'profile.label': 'Alışveriş profili:',
      'profile.applied': 'Sonraki mesajda kullanılacak:',
      'profile.none': 'Diyet veya bütçe filtresi yok',
      'diet.any': 'herhangi diyet',
      'diet.vegetarian': 'vejetaryen',
      'diet.vegan': 'vegan',
      'diet.gluten-free': 'glutensiz',
      'budget.placeholder': 'maks. bütçe €',
      'send': 'Gönder',
      'cart.heading': 'Sepetin',
      'cart.empty': 'Sepetin boş. Asistana sor ya da menüden ürün ekle.',
      'pay.review': 'PayPal ile gözden geçir ve öde',
      'pay.blocked': 'Politikan tarafından engellendi',
      'reset': 'Demoyu sıfırla',
      'payNote': 'Asistan sepeti hazırlayabilir. Ödemeyi yalnızca sen, PayPal (sandbox) üzerinden onaylarsın.',
      'scenario.heading': 'Bir senaryo dene',
      'scenario.note': 'Tek tıkla sepet dolar. Gördüğün karar, bu sayfadan değil sunucu tarafındaki politika motorundan gelir.',
      'menu.heading': 'Menü',
      'category.all': 'Tümü',
      'add': 'Ekle',
      'footer': 'Hackathon prototipi · Yalnızca PayPal sandbox · gerçek para hareket etmez. Diyet etiketleri bilgilendirmedir, alerjen garantisi değildir.',
      'lang.label': 'Dil',
      'agent.searching': 'Asistan menüyü arıyor…',
      'agent.ruleBased': 'Kural tabanlı planlayıcı (yapay zeka yok) — aşağıdaki sepet yine de sunucu tarafından fiyatlandırılır ve denetlenir.',
      'suggest.hint': 'Bütçenizi aşıyor, ama yine de kendiniz sepete ekleyebilir veya yeni bir istek yazabilirsiniz.',
      'suggest.add': 'Yine de sepete ekle:',
      'suggest.added': 'Sepetinize eklendi. İnceleyin, hazır olunca PayPal ile ödeyin.',
      'agent.aiBusy': 'Yapay zeka şu anda dolu. Bir dakika sonra tekrar dene ya da menüyü kullan.',
      'agent.notConfigured': 'Bu sunucuda yapay zeka yapılandırılmamış (sağlayıcı anahtarı yok). Yine de menüyü kullanabilirsin.',
      'agent.error': 'Hata: ',
      'checkout.contacting': 'PayPal ile bağlantı kuruluyor…',
      'checkout.noLink': 'PayPal onay bağlantısı döndürmedi',
      'checkout.cancelled': 'Ödeme iptal edildi. Hiçbir ücret alınmadı.',
      'checkout.mismatch': 'Bu PayPal dönüşü, bu tarayıcıdaki bir siparişle eşleşmiyor; bu yüzden hiçbir şey tahsil edilmedi.',
      'checkout.notConfigured': 'Bu sunucuda PayPal yapılandırılmamış.',
      'checkout.failed': 'Ödeme başarısız: ',
      'receipt.approved': 'PayPal ',
      'receipt.confirm': 'Ödemeyi onayla',
      'receipt.capturing': 'Tahsil ediliyor…',
      'receipt.title': 'Ödeme makbuzu',
      'receipt.status': 'Durum: ',
      'receipt.total': 'Ödenen toplam: ',
      'receipt.captureId': 'PayPal tahsilat kimliği: ',
      'receipt.controlCenter': 'Aracı Kontrol Merkezi\'ni aç',
      'decision.autoAllow.short': 'Limitlerin içinde',
      'decision.confirm.short': 'Onayın gerekiyor',
      'decision.block.short': 'Politika tarafından engellendi',
      'decision.autoAllow.long': 'Ödeme için ek onay gerekmez.',
      'decision.confirm.long': 'Bu ödemeyi PayPal üzerinde açıkça sen onaylamalısın.',
      'decision.block.long': 'Sunucu, PayPal ile bağlantı kurulmadan önce bu sepeti reddeder.',
      'policy.enforced': 'sunucu tarafından uygulanır',
      'policy.dailyBudget': 'Günlük bütçe ',
      'policy.dailyLeft': ' kaldı). Canlı politika kararını görmek için ürün ekle.',
      'why.title': 'Bu ürünler neden?',
      'why.none': 'Bu sepet için sunucu tarafından bir açıklama sağlanmadı.',
      'allergy.title': 'Alerjen uyarısı',
      'allergy.core': 'Bu işletme alerjen verisi yayınlamaz; bu yüzden hiçbir ürünün güvenli veya alerjensiz olduğu doğrulanamaz.',
      'allergy.unverified': 'Alerjen bilgileri doğrulanmamış. ',
      'allergy.concerns.prefix': 'Alerjen bilgileri doğrulanmamış — not ettiğin endişeler dahil: ',
      'allergy.concerns.local': ' Alerjen tercihleri yalnızca bu cihazda saklanır ve sunucu tarafında filtrelenmez.',
      'prefs.allergenLabel': 'Alerjen endişeleri (yerel olarak not edildi)',
      'prefs.dietLabel': 'Diyet tercihleri',
      'onboarding.title': 'AI Café\'ye hoş geldin',
      'onboarding.coco': 'Coco, yapay zeka baristadır. İsteğini okur, menüyü arar ve fiyatlandırılmış bir sepet hazırlar — ama parasal işlemi asla gerçekleştiremez. Her ödemeyi PayPal (sandbox) üzerinden sen onaylarsın.',
      'onboarding.explain': 'Coco bir sepet hazırladığında, yalnızca sunucu yanıtından oluşturulan kısa bir "Bu ürünler neden?" notu gösterir; böylece gerekçeyi ve politika kararını görebilirsin.',
      'onboarding.allergy': 'Alerjen bilgileri her zaman DOĞRULANMAMIŞ olarak gösterilir. İşletme alerjen verisi yayınlamaz ve Coco hiçbir ürünün güvenli olduğunu doğrulayamaz.',
      'onboarding.gotit': 'Anladım',
      'onboarding.again': 'Karşılama yardımını tekrar göster',
      'agent.greeting': 'Merhaba! Ne istediğini ve ne kadar harcamak istediğini söyle. Sepeti ben hazırlarım; ödemeyi sen onaylarsın.',
      'agent.noAnswer': '(yanıt yok)',
      'status.aiReady': 'Yapay zeka hazır',
      'status.aiOff': 'Yapay zeka yapılandırılmamış',
      'status.ppReady': 'PayPal',
      'status.ppOff': 'PayPal yapılandırılmamış',
      'chip.1': 'İki kişilik vejetaryen kahvaltı, 20 € altı',
      'chip.2': 'Bir arkadaş için doğum günü ikramı',
      'chip.3': 'Kahve ve atıştırmalık, en fazla 10 €',
      'reset.done': 'Demo sıfırlandı — sepet ve bekleyen sipariş temizlendi.',
      'policy.limits': 'Politika limitlerin',
      'policy.approvalAbove': 'üstü onay',
      'policy.max': 'en fazla',
      'receipt.approvedContinue': ' siparişini onayladı. Tamamlamak için onayla.',
      'receipt.step.cart': 'Sepet hazırlandı',
      'receipt.step.policy': 'Politika kararı',
      'receipt.step.paypal': 'PayPal’da onaylandı',
      'receipt.step.captured': 'Tahsil edildi',
      'who.title': 'Kim ne yaptı',
      'who.ai': 'Coco (yapay zeka) sepeti hazırladı',
      'who.rule': 'Kural tabanlı planlayıcı (yapay zeka yok) sepeti hazırladı',
      'who.you': 'Ödemeyi sen PayPal’da onayladın',
      'who.cannot': 'Yapay zeka ödeme yetkisi veremez, para hareket ettiremez',
      'receipt.date': 'Tarih: ',
      'scenario.everyday': 'Günlük sipariş',
      'scenario.quick': 'Hızlı kahve',
      'scenario.overLimit': 'Limit üstü',
      'scenario.team': 'Takım siparişi',
      'scenario.alcohol': 'Alkol talebi',
      'hint.needsApproval': 'onayın gerekiyor',
      'hint.autoAllowed': 'otomatik izinli',
      'hint.blocked': 'engellendi',
      'hint.blockedRule': 'kural tarafından engellendi'
    }
  };

  var STORAGE_KEY = 'aicafe.lang';

  function detectLang() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'tr') return saved;
    } catch (e) { /* ignore */ }
    var nav = (navigator.language || 'en').toLowerCase();
    return nav.indexOf('tr') === 0 ? 'tr' : 'en';
  }

  function localeFor(lang) { return lang === 'tr' ? 'tr-TR' : 'en-IE'; }

  var i18n = {
    lang: detectLang(),
    onChange: null,

    t: function (key) {
      var d = DICT[this.lang] || DICT.en;
      if (d[key] != null) return d[key];
      if (DICT.en[key] != null) return DICT.en[key];
      return key;
    },

    formatMoney: function (minor) {
      try {
        return new Intl.NumberFormat(localeFor(this.lang), { style: 'currency', currency: 'EUR' }).format(minor / 100);
      } catch (e) {
        return '€' + (minor / 100).toFixed(2);
      }
    },

    formatDate: function (date) {
      try {
        return new Intl.DateTimeFormat(localeFor(this.lang), { dateStyle: 'medium', timeStyle: 'short' }).format(date);
      } catch (e) {
        return date.toLocaleString();
      }
    },

    // Applies translations to every element carrying a data-i18n attribute.
    // For inputs, data-i18n="placeholder:KEY" sets the placeholder; otherwise
    // data-i18n="KEY" sets textContent. data-i18n-attr="href:URL" is ignored here.
    applyStatic: function () {
      var nodes = document.querySelectorAll('[data-i18n]');
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        var spec = el.getAttribute('data-i18n');
        if (spec.indexOf(':') >= 0) {
          var parts = spec.split(':');
          var attr = parts[0];
          var key = parts.slice(1).join(':');
          if (attr === 'placeholder' || attr === 'title' || attr === 'aria-label') {
            el.setAttribute(attr, this.t(key));
          }
        } else {
          // Do not overwrite elements whose content is filled dynamically.
          if (el.tagName === 'INPUT') {
            el.setAttribute('placeholder', this.t(spec));
          } else {
            el.textContent = this.t(spec);
          }
        }
      }
      // Select options localised by data-i18n-option="KEY".
      var opts = document.querySelectorAll('[data-i18n-option]');
      for (var j = 0; j < opts.length; j++) {
        opts[j].textContent = this.t(opts[j].getAttribute('data-i18n-option'));
      }
    },

    setLang: function (lang) {
      if (lang !== 'en' && lang !== 'tr') lang = 'en';
      this.lang = lang;
      try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* ignore */ }
      this.applyStatic();
      if (typeof this.onChange === 'function') this.onChange(lang);
    }
  };

  window.i18n = i18n;
})();
