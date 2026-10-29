import 'package:flutter/widgets.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import 'package:flutter_app/providers/locale_provider.dart';

/// Lightweight EN/TR string + formatting layer for the Flutter client.
///
/// No build step and no heavyweight localization package: every visible string
/// is looked up by key from [AppStrings.get], and money/date formatting uses
/// [intl] with the active locale. The active language lives in [LocaleProvider]
/// (persisted to SharedPreferences), so switching language rebuilds the UI
/// without a reload.
class AppStrings {
  static const Map<String, Map<String, String>> _dict = {
    'en': {
      'app.subtitle': 'AI-powered shopping · PayPal sandbox',
      'action.profile': 'Shopping profile',
      'action.clear': 'Clear conversation',
      'action.cart': 'Cart',
      'action.send': 'Send shopping request',
      'action.edit': 'Edit',
      'action.cancel': 'Cancel',
      'action.saveProfile': 'Save profile',
      'action.help': 'Help & intro',
      'lang.switch': 'Switch language',
      'catalog.error':
          'Could not load the café menu. Check the backend connection.',
      'catalog.retry': 'Retry',
      'catalog.added': 'Added %s to cart',
      'input.hint':
          'What would you like? Add a budget or dietary need.',
      'service.unavailable':
          'Backend unavailable — start the API and retry the menu.',
      'service.aiOn': 'AI configured',
      'service.aiOff': 'AI not configured',
      'service.ppOn': 'PayPal sandbox configured',
      'service.ppOff': 'PayPal not configured',
      'profile.loading': 'Loading shopping profile…',
      'profile.empty': 'Personalize AI suggestions with your preferences',
      'profile.saved': 'Shopping profile saved on this device.',
      'profile.saveError': 'Could not save shopping profile.',
      'profile.summary': 'AI profile: ',
      'profile.dialogTitle': 'Shopping profile',
      'profile.dietary': 'Dietary preferences',
      'profile.allergenTitle': 'Allergen concerns (noted locally)',
      'profile.budgetError': 'Enter a budget between €1 and €100.',
      'profile.budgetLabel': 'Maximum cart budget (EUR)',
      'profile.budgetHint': 'No limit',
      'profile.disclaimer':
          'Dietary preferences are sent to the server and used when planning a '
          'cart. Allergen concerns are stored only on this device: the server '
          'publishes no allergen data, so nothing here is verified server-side '
          'and no product is ever confirmed safe.',
      'welcome.title': 'A smarter way to order',
      'welcome.body':
          'Tell the AI what you need. It finds café items and prepares a priced '
          'cart for you to review. You stay in control: payment only happens '
          'after you approve it in PayPal sandbox.',
      'welcome.try': 'Try a request',
      'welcome.chip1': 'Vegetarian breakfast under €20',
      'welcome.prompt1': 'Plan a vegetarian breakfast for two under €20.',
      'welcome.chip2': 'A coffee and a treat',
      'welcome.prompt2': 'Find me a coffee and a sweet treat.',
      'msg.ruleBased': 'Rule-based answer · no AI',
      'suggest.hint':
          'This is over your budget, but you can still add it yourself, or type a new request.',
      'suggest.add': 'Add to cart anyway',
      'suggest.added':
          'Added to your cart. Review it, then pay with PayPal when you are ready.',
      'suggest.blocked': 'Your spending policy does not allow this cart.',
      'suggest.failed': 'Could not check this cart with the server. Please try again.',
      'receipt.title': 'Receipt',
      'receipt.status': 'Status',
      'receipt.total': 'Total',
      'receipt.captureId': 'Capture ID',
      'receipt.close': 'Close receipt',
      'receipt.qrAlt': 'QR code that opens the signed Cart Mandate check',
      'receipt.qrHint': 'Scan to verify this order\u2019s signed Cart Mandate',
      'receipt.copyLink': 'Copy verification link',
      'receipt.linkCopied': 'Link copied',
      'who.title': 'Who did what',
      'who.ai': 'Coco (AI) prepared the cart',
      'who.rule': 'Rule-based planner (no AI) prepared the cart',
      'who.you': 'You approved and paid on PayPal',
      'who.cannot': 'The AI cannot authorize or move money',
      'why.title': 'Why these items?',
      'cart.ruleBased': 'Rule-based cart (no AI) · your edits',
      'cart.aiPrepared': 'AI-prepared cart · your edits',
      'cart.subtotal': 'Subtotal: ',
      'cart.budgetMerchantLimit':
          'Your personal budget: {budget}. Merchant policy limit per purchase: {limit}. Both apply.',
      'cart.budgetMerchantLimitUnavailable':
          'Your personal budget: {budget}. The merchant policy limit could not be loaded; the server still checks it before checkout.',
      'cart.priceAtCheckout': 'Price at checkout',
      'cart.reviewPay': 'Review & pay',
      'cart.serverConfirm':
          'The server confirms final prices before PayPal checkout.',
      'checkout.openPayPal': 'Open PayPal',
      'checkout.returnNotReceived': 'Approval return not received?',
      'checkout.checkStatus': 'Check payment status',
      'checkout.confirmCapture': 'Confirm & capture payment',
      'checkout.statusNoPendingHandle': 'No pending order to handle.',
      'checkout.errorFinishOrCancelBeforeClear': 'Finish or cancel the PayPal order before clearing your cart.',
      'checkout.errorReturnMismatch': 'This PayPal return link does not match your pending order.',
      'checkout.statusApprovedCapture': 'PayPal approved your order. Confirm to capture payment.',
      'checkout.statusPaypalCancelled': 'Payment was cancelled in PayPal. Your cart is unchanged.',
      'checkout.errorCancelApi': 'Cancel failed (%s): %s',
      'checkout.statusApprovalUnconfirmed': 'Approval is not confirmed in AI Café yet. Return using PayPal’s link so this order can be validated.',
      'checkout.errorExistingOrder': 'Finish or cancel the existing PayPal order before starting another checkout.',
      'checkout.errorCartEmpty': 'Your cart is empty.',
      'checkout.statusCheckingPolicy': 'Checking your spending policy…',
      'checkout.errorPolicyBlocked': 'Blocked by your policy: %s',
      'checkout.errorPolicyBlockedGeneric': 'Blocked by your policy: limit exceeded.',
      'checkout.errorPolicyUnavailableRetry': 'Policy check unavailable. Try again.',
      'checkout.errorPolicyNotApproved': 'Your spending policy has not approved this cart yet.',
      'checkout.statusCreatingOrder': 'Creating PayPal order…',
      'checkout.statusOrderCreated': 'Order created. Opening PayPal for approval…',
      'checkout.statusApproveAndReturn': 'Approve the payment in PayPal. You will return here to confirm capture.',
      'checkout.statusOpenPaypalRetry': 'Could not open PayPal. Use the retry or manual return options.',
      'checkout.errorOpenApprovalPage': 'Could not open the PayPal approval page.',
      'checkout.errorCheckoutApi': 'Checkout failed (%s): %s',
      'checkout.errorUnexpected': 'Checkout failed: %s',
      'checkout.errorNoSecureApprovalLink': 'No secure PayPal approval link is available for this order.',
      'checkout.statusReopenApproval': 'Approve the order in PayPal, then return to AI Café.',
      'checkout.errorOpenPayPal': 'Could not open PayPal: %s',
      'checkout.errorCartClearAfterCapture': 'Payment captured, but the AI cart could not be cleared: %s',
      'checkout.errorCartClearAfterAlreadyPaid': 'Payment was already completed, but the AI cart could not be cleared: %s',
      'checkout.errorNoPendingCapture': 'No pending order to capture.',
      'checkout.errorApprovalRequired': 'Approve the order in PayPal before capturing payment.',
      'checkout.statusCapturing': 'Capturing payment…',
      'checkout.statusCaptured': 'Payment captured! Status: %s%s',
      'checkout.statusPaymentPending': 'PayPal has not confirmed the payment yet. Check its status again before starting another order.',
      'checkout.errorPaymentIncomplete': 'PayPal did not complete the payment. Your cart is unchanged; review checkout to try again.',
      'checkout.statusAlreadyCompleted': 'Payment was already completed for this order.',
      'checkout.errorCaptureUnconfirmed': 'Capture could not be confirmed (%s): %s',
      'checkout.errorCaptureApi': 'Capture failed (%s): %s',
      'checkout.errorNoPendingCancel': 'No pending order to cancel.',
      'checkout.statusOrderCancelled': 'Order cancelled (status: %s).',
      'checkout.statusOrderAlreadyPaid': 'This order was already paid.',
      'checkout.statusOrderMissing': 'The order no longer exists; nothing to cancel.',
      'cart.title': 'Your cart',
      'cart.empty': 'Cart is empty. Tap a product chip to add items.',
      'cart.qty': 'qty %s',
      'cart.checkout': 'Checkout with PayPal',
      'policy.checking': 'Checking your spending policy…',
      'policy.allowed': 'Within your limits.',
      'policy.needsApproval': 'Needs your approval on PayPal.',
      'policy.blocked': 'Blocked by your policy: %s',
      'policy.error': 'Policy check unavailable.',
      'policy.allowanceRemaining': 'Remaining today: %s',
      'policy.allowancePerPurchase': 'max %s per purchase',
      'policy.allowanceDisabled': 'allowance off',
      'policy.allowanceExpires': 'expires %s',
      'allergy.core':
          'This shop does not publish allergen data, so no item can be '
          'confirmed safe or allergen-free.',
      'allergy.unverified': 'Allergy information is unverified.',
      'allergy.concerns.prefix':
          'Allergy information is unverified — including your noted concern(s): ',
      'allergy.concerns.local':
          'Allergen preferences are stored locally and are not filtered '
          'server-side.',
      'msg.empty': 'The assistant returned an empty response. Please try again.',
      'error.timeout':
          'The AI request timed out. Check your connection and try again.',
      'error.chatPrefix': 'Chat error',
      'error.unknown': 'Something went wrong',
      'error.clearConvPrefix': 'Could not clear the conversation',
      'error.clearConvUnreachable':
          'Could not reach the server to clear the conversation.',
      'error.clearCartPrefix': 'Could not clear the AI cart',
      'error.clearCartUnreachable':
          'Could not reach the server to clear the AI cart.',
      'error.paypalLink': 'Could not read the PayPal return link',
      'checkout.mismatch':
          'This PayPal return link does not match your pending order.',
      'onboarding.title': 'Welcome to AI Café',
      'onboarding.coco':
          'Coco is the AI barista. It reads your request, searches the menu and '
          'prepares a priced cart — but it can never move your money. You '
          'approve every payment in PayPal (sandbox).',
      'onboarding.explain':
          'When Coco prepares a cart it shows a short "Why these items?" note '
          'built only from the server response, so you can see the reasoning '
          'and the policy verdict.',
      'onboarding.allergy':
          'Allergy information is always shown as UNVERIFIED. The shop '
          'publishes no allergen data and Coco cannot confirm any item is safe.',
      'onboarding.gotit': 'Got it',
      'voice.mic': 'Voice input',
      'voice.stop': 'Stop listening',
      'voice.listening': 'Listening… tap the mic again to stop',
      'voice.review': 'Review your spoken request, then send',
      'voice.error': 'Voice recognition error. Type your request instead.',
      'voice.permissionDenied':
          'Microphone permission was denied. Type your request instead.',
      'voice.unavailableHint':
          'Voice input isn’t available on this device — type your request.',
    },
    'tr': {
      'app.subtitle': 'Yapay zeka destekli alışveriş · PayPal sandbox',
      'action.profile': 'Alışveriş profili',
      'action.clear': 'Sohbeti temizle',
      'action.cart': 'Sepet',
      'action.send': 'Alışveriş isteği gönder',
      'action.edit': 'Düzenle',
      'action.cancel': 'İptal',
      'action.saveProfile': 'Profili kaydet',
      'action.help': 'Yardım & tanıtım',
      'lang.switch': 'Dili değiştir',
      'catalog.error':
          'Kafe menüsü yüklenemedi. Arka uç bağlantısını kontrol edin.',
      'catalog.retry': 'Tekrar dene',
      'catalog.added': '%s sepete eklendi',
      'input.hint': 'Ne istersin? Bir bütçe veya diyet ihtiyacı ekle.',
      'service.unavailable':
          'Arka uç kullanılamıyor — API’yi başlatıp menüyü yeniden deneyin.',
      'service.aiOn': 'Yapay zeka yapılandırıldı',
      'service.aiOff': 'Yapay zeka yapılandırılmadı',
      'service.ppOn': 'PayPal sandbox yapılandırıldı',
      'service.ppOff': 'PayPal yapılandırılmadı',
      'profile.loading': 'Alışveriş profili yükleniyor…',
      'profile.empty':
          'Yapay zeka önerilerini tercihlerinle kişiselleştir',
      'profile.saved': 'Alışveriş profili bu cihaza kaydedildi.',
      'profile.saveError': 'Alışveriş profili kaydedilemedi.',
      'profile.summary': 'Yapay zeka profili: ',
      'profile.dialogTitle': 'Alışveriş profili',
      'profile.dietary': 'Diyet tercihleri',
      'profile.allergenTitle': 'Alerjen endişeleri (yerel olarak not edildi)',
      'profile.budgetError': '1 € ile 100 € arasında bir bütçe girin.',
      'profile.budgetLabel': 'Azami sepet bütçesi (EUR)',
      'profile.budgetHint': 'Sınır yok',
      'profile.disclaimer':
          'Diyet tercihleri sunucuya gönderilir ve sepet planlarken kullanılır. '
          'Alerjen endişeleri yalnızca bu cihazda saklanır: sunucu alerjen '
          'verisi yayınlamaz; bu yüzden hiçbir şey sunucu tarafında '
          'doğrulanmaz ve hiçbir ürünün güvenli olduğu kanıtlanmaz.',
      'welcome.title': 'Sipariş vermenin daha akıllı yolu',
      'welcome.body':
          'Yapay zekaya neye ihtiyacın olduğunu söyle. Kafe ürünlerini bulur ve '
          'senin incelemen için fiyatlandırılmış bir sepet hazırlar. Kontrol '
          'sende kalır: ödeme yalnızca PayPal (sandbox) üzerinde onayladığında '
          'gerçekleşir.',
      'welcome.try': 'Bir istek dene',
      'welcome.chip1': '20 € altı vejetaryen kahvaltı',
      'welcome.prompt1': 'İki kişilik vejetaryen bir kahvaltı planla, 20 € altı.',
      'welcome.chip2': 'Bir kahve ve bir ikram',
      'welcome.prompt2': 'Bana bir kahve ve tatlı bir ikram bul.',
      'msg.ruleBased': 'Kural tabanlı yanıt · yapay zeka yok',
      'suggest.hint':
          'Bütçenizi aşıyor, ama yine de kendiniz sepete ekleyebilir veya yeni bir istek yazabilirsiniz.',
      'suggest.add': 'Yine de sepete ekle',
      'suggest.added':
          'Sepetinize eklendi. İnceleyin, hazır olunca PayPal ile ödeyin.',
      'suggest.blocked': 'Harcama politikanız bu sepete izin vermiyor.',
      'suggest.failed': 'Sepet sunucuda kontrol edilemedi. Lütfen tekrar deneyin.',
      'receipt.title': 'Makbuz',
      'receipt.status': 'Durum',
      'receipt.total': 'Toplam',
      'receipt.captureId': 'Tahsilat no',
      'receipt.close': 'Makbuzu kapat',
      'receipt.qrAlt': 'İmzalı Cart Mandate doğrulamasını açan QR kod',
      'receipt.qrHint': 'Bu siparişin imzalı Cart Mandate kaydını doğrulamak için tara',
      'receipt.copyLink': 'Doğrulama bağlantısını kopyala',
      'receipt.linkCopied': 'Bağlantı kopyalandı',
      'who.title': 'Kim ne yaptı',
      'who.ai': 'Coco (yapay zeka) sepeti hazırladı',
      'who.rule': 'Kural tabanlı planlayıcı (yapay zeka yok) sepeti hazırladı',
      'who.you': 'Ödemeyi sen PayPal\u2019da onayladın',
      'who.cannot': 'Yapay zeka ödeme yetkisi veremez, para hareket ettiremez',
      'why.title': 'Bu ürünler neden?',
      'cart.ruleBased': 'Kural tabanlı sepet (yapay zeka yok) · senin düzenlemelerin',
      'cart.aiPrepared': 'Yapay zeka hazırladı · senin düzenlemelerin',
      'cart.subtotal': 'Ara toplam: ',
      'cart.budgetMerchantLimit':
          'Kişisel bütçen: {budget}. İşletme politikası alışveriş başına limiti: {limit}. İkisi de geçerlidir.',
      'cart.budgetMerchantLimitUnavailable':
          'Kişisel bütçen: {budget}. İşletme politikası limiti yüklenemedi; sunucu ödeme öncesinde limiti yine kontrol eder.',
      'cart.priceAtCheckout': 'Ödeme anında',
      'cart.reviewPay': 'Gözden geçir ve öde',
      'cart.serverConfirm':
          'Sunucu, PayPal ödemesinden önce son fiyatları onaylar.',
      'checkout.openPayPal': 'PayPal’ı aç',
      'checkout.returnNotReceived': 'Onay dönüşü alınmadı mı?',
      'checkout.checkStatus': 'Ödeme durumunu kontrol et',
      'checkout.confirmCapture': 'Onayla ve ödemeyi tahsil et',
      'checkout.statusNoPendingHandle': 'İşleme alınacak bekleyen bir sipariş yok.',
      'checkout.errorFinishOrCancelBeforeClear': 'Sepeti temizlemeden önce PayPal siparişini tamamla veya iptal et.',
      'checkout.errorReturnMismatch': 'Bu PayPal dönüş bağlantısı bekleyen siparişinle eşleşmiyor.',
      'checkout.statusApprovedCapture': 'PayPal siparişini onayladı. Ödemeyi tahsil etmek için onayla.',
      'checkout.statusPaypalCancelled': 'PayPal işlemi iptal edildi. Sepetin değişmedi.',
      'checkout.errorCancelApi': 'İptal başarısız (%s): %s',
      'checkout.statusApprovalUnconfirmed': 'Onay henüz AI Café tarafından doğrulanmadı. Siparişin doğrulanabilmesi için PayPal bağlantısıyla geri dön.',
      'checkout.errorExistingOrder': 'Yeni bir ödeme başlatmadan önce mevcut PayPal siparişini tamamla veya iptal et.',
      'checkout.errorCartEmpty': 'Sepetin boş.',
      'checkout.statusCheckingPolicy': 'Harcama politikan kontrol ediliyor…',
      'checkout.errorPolicyBlocked': 'Politikan tarafından engellendi: %s',
      'checkout.errorPolicyBlockedGeneric': 'Politikan tarafından engellendi: limit aşıldı.',
      'checkout.errorPolicyUnavailableRetry': 'Harcama politikası kontrol edilemiyor. Tekrar dene.',
      'checkout.errorPolicyNotApproved': 'Harcama politikan bu sepeti henüz onaylamadı.',
      'checkout.statusCreatingOrder': 'PayPal siparişi oluşturuluyor…',
      'checkout.statusOrderCreated': 'Sipariş oluşturuldu. Onay için PayPal açılıyor…',
      'checkout.statusApproveAndReturn': 'Ödemeyi PayPal’da onayla. Tahsilatı doğrulamak için buraya döneceksin.',
      'checkout.statusOpenPaypalRetry': 'PayPal açılamadı. Tekrar dene veya elle dönüş seçeneklerini kullan.',
      'checkout.errorOpenApprovalPage': 'PayPal onay sayfası açılamadı.',
      'checkout.errorCheckoutApi': 'Ödeme başlatılamadı (%s): %s',
      'checkout.errorUnexpected': 'Ödeme işlemi başarısız: %s',
      'checkout.errorNoSecureApprovalLink': 'Bu sipariş için güvenli bir PayPal onay bağlantısı yok.',
      'checkout.statusReopenApproval': 'Siparişi PayPal’da onayla, ardından AI Café’ye dön.',
      'checkout.errorOpenPayPal': 'PayPal açılamadı: %s',
      'checkout.errorCartClearAfterCapture': 'Ödeme alındı ancak yapay zeka sepeti temizlenemedi: %s',
      'checkout.errorCartClearAfterAlreadyPaid': 'Ödeme zaten tamamlanmış ancak yapay zeka sepeti temizlenemedi: %s',
      'checkout.errorNoPendingCapture': 'Ödeme için bekleyen bir sipariş yok.',
      'checkout.errorApprovalRequired': 'Ödemeyi tahsil etmeden önce siparişi PayPal’da onayla.',
      'checkout.statusCapturing': 'Ödeme tahsil ediliyor…',
      'checkout.statusCaptured': 'Ödeme alındı! Durum: %s%s',
      'checkout.statusPaymentPending': 'PayPal ödemeyi henüz doğrulamadı. Yeni bir sipariş başlatmadan önce durumu tekrar kontrol et.',
      'checkout.errorPaymentIncomplete': 'PayPal ödemeyi tamamlamadı. Sepetin değişmedi; tekrar denemek için ödeme adımını gözden geçir.',
      'checkout.statusAlreadyCompleted': 'Bu siparişin ödemesi zaten tamamlanmış.',
      'checkout.errorCaptureUnconfirmed': 'Ödeme tahsilatı doğrulanamadı (%s): %s',
      'checkout.errorCaptureApi': 'Ödeme tahsilatı başarısız (%s): %s',
      'checkout.errorNoPendingCancel': 'İptal edilecek bekleyen bir sipariş yok.',
      'checkout.statusOrderCancelled': 'Sipariş iptal edildi (durum: %s).',
      'checkout.statusOrderAlreadyPaid': 'Bu sipariş zaten ödendi.',
      'checkout.statusOrderMissing': 'Sipariş artık yok; iptal edilecek bir şey bulunmuyor.',
      'cart.title': 'Sepetin',
      'cart.empty': 'Sepet boş. Ürün eklemek için bir çip’e dokun.',
      'cart.qty': 'adet %s',
      'cart.checkout': 'PayPal ile ödeme',
      'policy.checking': 'Harcama politikası kontrol ediliyor…',
      'policy.allowed': 'Limitlerin içinde.',
      'policy.needsApproval': 'PayPal’da onayın gerekiyor.',
      'policy.blocked': 'Politikan tarafından engellendi: %s',
      'policy.error': 'Politika kontrolü kullanılamıyor.',
      'policy.allowanceRemaining': 'Bugün kalan: %s',
      'policy.allowancePerPurchase': 'satın alma başına maksimum %s',
      'policy.allowanceDisabled': 'izin kapalı',
      'policy.allowanceExpires': '%s tarihine kadar geçerli',
      'allergy.core':
          'Bu işletme alerjen verisi yayınlamaz; bu yüzden hiçbir ürünün '
          'güvenli veya alerjensiz olduğu doğrulanamaz.',
      'allergy.unverified': 'Alerjen bilgileri doğrulanmamış.',
      'allergy.concerns.prefix':
          'Alerjen bilgileri doğrulanmamış — not ettiğin endişeler dahil: ',
      'allergy.concerns.local':
          'Alerjen tercihleri yalnızca bu cihazda saklanır ve sunucu '
          'tarafından filtrelenmez.',
      'msg.empty':
          'Asistan boş bir yanıt döndürdü. Lütfen tekrar dene.',
      'error.timeout':
          'Yapay zeka isteği zaman aşımına uğradı. Bağlantını kontrol edip '
          'tekrar dene.',
      'error.chatPrefix': 'Sohbet hatası',
      'error.unknown': 'Bir şeyler ters gitti',
      'error.clearConvPrefix': 'Sohbet temizlenemedi',
      'error.clearConvUnreachable':
          'Sohbeti temizlemek için sunucuya ulaşılamadı.',
      'error.clearCartPrefix': 'Yapay zeka sepeti temizlenemedi',
      'error.clearCartUnreachable':
          'Yapay zeka sepetini temizlemek için sunucuya ulaşılamadı.',
      'error.paypalLink': 'PayPal dönüş bağlantısı okunamadı',
      'checkout.mismatch':
          'Bu PayPal dönüş bağlantısı bekleyen siparişinle eşleşmiyor.',
      'onboarding.title': 'AI Café’ye hoş geldin',
      'onboarding.coco':
          'Coco, yapay zeka baristadır. İsteğini okur, menüyü arar ve '
          'fiyatlandırılmış bir sepet hazırlar — ama parasal işlemi asla '
          'gerçekleştiremez. Her ödemeyi PayPal (sandbox) üzerinden sen '
          'onaylarsın.',
      'onboarding.explain':
          'Coco bir sepet hazırladığında, yalnızca sunucu yanıtından oluşturulan '
          'kısa bir "Bu ürünler neden?" notu gösterir; böylece gerekçeyi ve '
          'politika kararını görebilirsin.',
      'onboarding.allergy':
          'Alerjen bilgileri her zaman DOĞRULANMAMIŞ olarak gösterilir. İşletme '
          'alerjen verisi yayınlamaz ve Coco hiçbir ürünün güvenli olduğunu '
          'doğrulayamaz.',
      'onboarding.gotit': 'Anladım',
      'voice.mic': 'Sesli giriş',
      'voice.stop': 'Dinlemeyi durdur',
      'voice.listening': 'Dinleniyor… durdurmak için mikrofona tekrar dokun',
      'voice.review': 'Konuşmanı incele, sonra gönder',
      'voice.error': 'Ses tanıma hatası. İsteğini yazarak gir.',
      'voice.permissionDenied':
          'Mikrofon izni reddedildi. İsteğini yazarak gir.',
      'voice.unavailableHint':
          'Bu cihazda sesli giriş kullanılamıyor — isteğini yaz.',
    },
  };

  /// Returns the string for [key] in [lang], falling back to English, then to
  /// the key itself so the UI never breaks on a missing translation.
  static String get(String lang, String key) {
    final dict = _dict[lang] ?? _dict['en']!;
    return dict[key] ?? _dict['en']![key] ?? key;
  }

  /// intl locale tag for money/date formatting.
  static String localeTag(String lang) => lang == 'tr' ? 'tr_TR' : 'en_IE';

  /// Locale-aware currency formatting (e.g. EUR) using the active language.
  static String formatMoney(String lang, int minor, String currency) {
    try {
      return NumberFormat.simpleCurrency(
        locale: localeTag(lang),
        name: currency,
      ).format(minor / 100);
    } catch (_) {
      return '$currency ${(minor / 100).toStringAsFixed(2)}';
    }
  }

  /// Locale-aware "HH:mm" time formatting for chat bubbles.
  static DateFormat timeFormat(String lang) =>
      DateFormat('HH:mm', localeTag(lang));
}

/// Convenience accessor: resolves the active language from [LocaleProvider] and
/// returns the translated string for [key].
String t(BuildContext context, String key) {
  final lang = Provider.of<LocaleProvider>(context, listen: false).languageCode;
  return AppStrings.get(lang, key);
}
