# Trust-Layer Gap Report — Scoped AI Allowance + Dispute Evidence Package

**Stage 0 — salt okunur kod incelemesi (kod değişikliği yok)**
Tarih: 2026-10-29 | Kapsam: `source/apps/backend`, `source/apps/flutter_app`

---

## 1. Özet değerlendirme

Önerilen MVP ("Scoped AI Allowance" + "İtiraz Kanıt Paketi" + hafif "Checkout Rescue")
kod tabanına çok iyi oturuyor. Güven katmanının **sunucu tarafı motoru büyük ölçüde zaten var**:
- Politika motoru (per-işlem limiti, günlük bütçe, kategori engeli, tüccar allow-list, onay eşiği) **sunucuda** zorunlu ve sipariş **create + capture**'ta tekrar doğrulanıyor.
- Günlük harcama **rezervasyonla** uygulanıyor, restart'a dayanıyor.
- Cart Mandate Ed25519 **imzalı**, değiştirilemez, stabil-canonical; fiyatlar + `policyEnforcedByServer` + `paymentAuthority:'buyer_approval_at_paypal'` içeriyor.

Gerçek iş **yeni motor değil**: (a) iznin kullanıcıya görünür ver/iptal/süresi-dol yaşam döngüsü, (b) iznin mandate'te **kanıtlanması**, (c) uçtan uca **Kanıt Paketi** derleme/doğrulama endpoint'i, (d) checkout rescue mesaj cilası.

---

## 2. Mevcut mimari haritası (ne zaten var)

| Katman | Dosya | Durum |
|---|---|---|
| Oturum kimliği (anonim) | `src/session/session-store.ts` | Her oturuma özel opak `userId` (`userIdForSessionId`). İstemci sessionId/token seçemez; token SHA-256 ile saklanır. **Politika userId ile key'li → zaten oturum-izole.** |
| Politika modeli | `src/policy/domain.ts` | `PurchasePolicy`: `maxPerPurchaseMinor`, `dailySpendLimitMinor`, `allowedMerchantIds`, `blockedCategoryIds`, `requiredDietaryAttributes`, `confirmationThresholdMinor`, `enabled`. |
| Politika motoru (sunucu) | `src/policy/service.ts` | Deterministik, saf; `evaluatePurchase` tüm kuralları uygular, `BLOCK`/`REQUIRE_CONFIRMATION`/`AUTO_ALLOW` döner. |
| Günlük bütçe | `src/policy/daily-spend-tracker.ts` | Rezervasyon (tryReserve/confirm/cancel/expire) + kalıcılık + restart hydrate. `getSpentToday`/`getPendingReservations`. |
| Politikayı sakla/olaylar | `src/policy/storage.ts` | `getOrCreatePolicy(userId)`, `recordEvent(...)` → `PolicyEvent` (decision, violatedRules, reason, policySnapshot{limits}, cartId, orderId). |
| Politika önizleme (advisory) | `src/routes/policy-preview.ts` | Aynı motoru çalıştırır, `limits` (spent/pending/remaining) döner. Yan etkisiz. |
| Zorunlu uygulama | `src/routes/orders.ts` | `/orders/create`: input doğrulama → otoritatif `evaluatePurchase` → BLOCK 403 → rezervasyon → order persist → PayPal. `/capture`: ownership, lock, reconciliation, amount-match doğrulama, rezervasyon confirm/cancel. |
| Cart Mandate | `src/mandate/mandate-service.ts` | Ed25519 imza, `fast-json-stable-stringify`, `sessionBinding` (hash), `constraints`. Verify endpoint'leri: `/mandates/verify`, `/mandates/public`, `/.well-known/mandate-keys.json`. |
| PayPal referansları | `src/orders/domain.ts` | Order'da `paypalOrderId`, `paypalCaptureId`, `paypalStatus`, `reservationId`, `captureStartedAt`. |
| İadeler | `src/refunds/service.ts` | İnsan onaylı, doğrulamalı iade akışı (PROPOSED→PROCESSING→REFUNDED). |
| AI taraflı | `src/ai/*` + `src/routes/ai.ts` | AI sepet hazırlar; `preparedCart` + `checkoutReady`; origin AI_ASSISTED/AI_AGENT. |

**Sonuç:** "AI ödemeyi/capture yapamaz", "fiyat sunucuda", "izin sunucuda", "insan onayı olmadan capture yok", "idempotency/çift işlem önlemi" ilkeleri **zaten uygulanmış ve test edilmiş**.

---

## 3. Boşluk analizi

### 3.1 Scoped AI Allowance

Ne var: sunucuda zorunlu limitler + günlük bütçe + kategori/merchant kısıtları + önizleme.

Boşluklar:
1. **Kullanıcıya görünür yaşam döngüsü yok.** Politika `getOrCreatePolicy` ile dolaylı/otomatik oluşuyor; shopper'ın görebileceği/set edebileceği bir **ver/iptal/süresi-dol ekranı** veya **API** yok (yalnızca işletme profili üzerinden varsayılan limitler).
2. **Oturum-kapsamı yönetimi netleşmeli.** Teknik olarak userId zaten oturumla izole; ama `defaultPolicy` ayrıca `demo-user-001` seed'i içeriyor. "Hesap kimliği yoksa oturum izni" kuralı **dokümante edilmeli ve testle sabitlenmeli** (oturum userId'sine bağlı izinlerin başka oturumla erişilemezliği).
3. **İzin "süresi" kavramı yok.** Günlük bütçe gündüz resetlenir; ancak "bu izin X tarihine kadar geçerli" gibi ayrık bir `expiresAt` yok. (İstenirse `PurchasePolicy`'ye `validUntil` eklenir ve `evaluatePurchase` 'ta kontrol edilir.)
4. **Mandate'te uygulanan izin kanıtlanmıyor.** `constraints.policyEnforcedByServer` sadece genel bir bayrak. Hangi limitlerin (maxPerPurchase, dailyLimit, vs.) uygulandığı **PolicyEvent.policySnapshot**'ta zaten var; Kanıt Paketi bunu kullanabiliir. İstenirse mandate `constraints`'ine de `appliedLimits` eklenebilir.

Önerilen değişiklik şekli (Stage 2):
- `PurchasePolicy`'ye opsiyonel `validUntil?: Date` ekle; `evaluatePurchase` + `context-builder`'da `validUntil < now → BLOCK/expired` kontrolü.
- Yeni `PATCH /api/policy` (requireSession, sadece kendi userId) ile shopper kendi iznini görüp güncelleyebilsin (maxPerPurchase/dailySpendLimit/validUntil); `policyStorage.setPolicy` yeniden kullanılır.
- Flutter tarafı: `policy-preview` zaten limits döner; bir "Allowance" kartı/ekranı (limiteler, kalan bütçe, süresi dolma) mevcut `cart_policy_gate` UI'ına eklenir.
- Mandate: `buildCartMandate`'te `constraints`'e (opsiyonel) `appliedLimits` ekle — imza bunu kapsar.

### 3.2 İtiraz / Kanıt Paketi

Ne var: imzalı mandate, PolicyEvent kayıtları, PayPal ref'leri, doğrulama endpoint'leri.

Boşluklar:
1. **Tek paket derleme endpoint'i yok.** mandate + politika kararı + insan onayı + PayPal ref + zaman damgalarını birleştiren bir `GET /api/orders/:id/evidence` yok.
2. **Paket bütünlüğü imzalanmıyor.** Yalnızca mandate imzalı; paketin tamamı (order ref, policy event, capture ref) ayrı bir **hash/imza** ile korunmuyor. Değiştirilmiş bir paket ancak mandate doğrulamasıyla yakalanır, paket fabrikasyonuyla değil.
3. **Minimum PII ihlal riski.** Paket, gerçek `userId`, `sessionId`, internal id'leri içermemeli; `publicSessionRef` benzeri etiketler + `sessionBinding` (hash) kullanılmalı.
4. **"Sunulabilir" garantisi.** PayPal Disputes API'ye otomatik gönderim doğrulanmadığı sürece paket UI'ında "PayPal'a sunulabilir" iddiası olmamalı.

Önerilen değişiklik şekli (Stage 3):
- `GET /api/orders/:id/evidence` (requireSession, ownership): yanıt = `{ package: { mandate (signed), orderRef {orderId, origin, status, totals, createdAt}, policyEvents [...], paypal { orderId, captureId, status, capturedAt }, humanApproval { method:'paypal_buyer_approval' } }, integrity: { digest, alg, signedWith } }`.
- `integrity`: paket kanonik JSON'unun SHA-256 digest'i + (opsiyonel) Ed25519 imza (mevcut mandate keyring'i). Doğrulama endpoint'i `POST /api/evidence/verify`.
- Pakete yalnızca **gerekli, dışa aktarılabilir** alanları koy; PII azaltma kurallarını testle sabitle.

### 3.3 Checkout Rescue (hafif)

Durum: Zaten güçlü — 400/402/409(settled true/false)/502 sınıflandırması, retry öncesi reconciliation, amount-match doğrulama, belirsiz senaryolarda rezervasyon korunuyor.
Kalan: yalnızca kullanıcıya dönük **durum mesajı cilası** (belirsiz/retryable durumlarda "neden beklediğini" açıkça söyleyen metinler). Otomatik retry **özellikle yapılmamalı**.

---

## 4. Veri akışı önerisi

```
Shopper UI ── PATCH /api/policy (scoped allowance: de, expiry)
   │
   ▼
[policyStorage] ── or → /orders/create (otoritatif evaluatePurchase)
   │                                   │  BLOCK/OK
   │                                   ▼
   │                            daily-spend rezervasyon
   │                                   │
   ▼                                   ▼
PolicyEvent (userId, cartId, orderId, policySnapshot) ←─ order persist
   │                                   │
   └──→ Kanıt Paketi derleyici (GET /api/orders/:id/evidence)
            ├─ imzalı mandate (mevcut)
            ├─ PolicyEvent snapshot'ları
            ├─ order/paypal ref (paypalOrderId, captureId, status)
            ├─ humanApproval bilgisi
            └─ integrity (digest + imza) → POST /api/evidence/verify
```

Güvenlik sınırları (değişmez):
- AI ödeme/capture **yapamaz**; fiyat, politika, izin, onay **sunucuda**.
- Tekrar isteklerinde idempotency + ownership + lock + reconciliation (mevcut).
- AI sağlayıcısı düşse bile kural tabanlı mod politikayı **atlamaz** (Politika `policyService`'den bağımsız çalışmaz — stage 2'de testle sabitle).
- İmza/kanıt doğrulaması başarısızsa **açıkça** göster, sessizce geçerli sayma.

---

## 5. Test / regresyon notları

- Mevcut **961 backend testi geçiyor**; değişiklikler testleri bozmamalı (özellikle `policy.test.ts`, `orders.test.ts`, `fallback-planner`, `mandate-*`).
- Yeni negatif testler (Stage 2): süresi dolmuş izin, iptal edilmiş izin, limit aşımı, yasaklı ürün, eşzamanlı istekler, başka oturumun iznine erişememe.
- Yeni Kanıt Paketi testleri (Stage 3): paket üretimi, imza/hash doğrulama, eksik kayıt, kurcalanmış paket, PII yokluğu.

---

## 6. Önerilen sıralama

| Aşama | Kapsam | Tahmini etki |
|---|---|---|
| 1 | Kurallar + veri akışı dokümantasyonu (bu rapor + API şeması) | — |
| 2 | Scoped Allowance (backend kuralları `validUntil` + `PATCH /api/policy` + negatif testler; sonra UI + mandate `appliedLimits`) | Orta-düşük risk |
| 3 | Kanıt Paketi (`GET /api/orders/:id/evidence` + `POST /api/evidence/verify` + testler) | Orta risk |
| 4 | Checkout Rescue mesaj cilası | Düşük |
| 5 | Demo + regresyon + sandbox senaryoları | — |

> Not: "14 gün" süresi, kod/test görülmeden verilen varsayımsal bir tahmin; Stage 0 itibarıyla backend'de büyük mimari değişiklik gerekmiyor, bu yüzden sürenin daha kısa olması beklenir.

---

## 7. Stage 2/3 teslim durumu (uygulandı, doğrulandı)

**Backend tam suite: 92 suite / 980 test PASS** (önceki 90/961 → +2 suite/+19 test yeni; regresyon yok).

### Stage 2 — Scoped AI Allowance ✅
- `PurchasePolicy.validUntil` (opsiyonel) + yeni ihlal türü **`ALLOWANCE_EXPIRED`**. `PolicyService.evaluatePurchase` süresi dolmuş izni (devre dışı olsa bile) `BLOCK` yapar.
- **GET/PATCH `/api/policy`** (`src/routes/policy.ts`, `requireSession`): oturum-kapsamı izin görünümü (limits + usage: spent/pending/remaining) ve kara listeli PATCH (yalnızca güvenli alanlar; `validUntil` yalnızca geleceğe; daily≥perPurchase ve threshold≤perPurchase çapraz alan invariant'ları; `enabled` boolean; kara liste dışı alanlar sessizce yok sayılır). `app.ts`'e kayıt edildi; `validUntil` `/api/policy/preview` yanıtına da eklendi.
- **Mandate `appliedLimits`**: `Order.policyAppliedLimits` sipariş oluşturulurken **sunucuda** doldurulur ve imzalı Cart Mandate `constraints.appliedLimits` bloğuna gömülür → izin kanıtlanır, imza kapsar.
- Flutter: `PolicyAllowance` modeli, `ApiService.fetchPolicy/updatePolicy`, `CheckoutProvider.allowance`+`refreshAllowance()` ve sepet politikası satırının altına izin satırı (limits/kalan/süre) eklendi. `flutter analyze` temiz.

### Stage 3 — İtiraz Kanıt Paketi ✅
- **GET `/api/orders/:id/evidence`** (yalnızca kendi oturumu) + **POST `/api/evidence/verify`** (oturumsuz).
- Paket: imzalı mandate + otoritatif politika olayları (PII-zarıtılmış: id/timestamp/decision/rules/reason/amount/currency/policySnapshot, userId/sessionId/cartId yok) + sipariş/PayPal referansları + `humanApproval` durumu + integrity (sha256 digest + **aynı Ed25519 keyring** ile imza).
- Testler: geçerli paket doğrulama, kurcalanmış total → geçersiz, başka oturum → 404, eksik sipariş → 404, PII yokluğu.

### Açık kalanlar
- **Stage 4** (Checkout Rescue mesaj cilası) — küçük, önceliği düşük.
- **Stage 5** (demo + sandbox senaryosu + regresyon tekrarı) — ortam (sandbox loopback kısıtı) nedeniyle `flutter test` burada çalıştırılamadı; `flutter analyze` temiz.
