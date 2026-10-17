# Emülatör E2E Test Raporu — AI Café (AI Cafe / FinCan)

**Tarih:** 11 Ekim 2026 · **Ortam:** Android 16 emülatör (`emulator-5554`) + yerel backend
**Kapsam:** Gerçek emülatörde uygulama çalıştırma, tüm kullanıcı akışlarını sürme, sorunları tespit ve doğrulama.
**Mod:** Kodda hiçbir değişiklik yapılmadı (salt test). A1.9A değişiklikleri korundu.

## Ortam kurulumu (kanıt)
- Backend: `npm run dev` → port 3000. Log: `Server running on port 3000`, `PayPal: disabled (S1 mode)`.
- App: `flutter run -d emulator-5554` (debug) → APK derlendi, yüklendi, Impeller (OpenGLES) ile çalıştı.
- Base URL (debug): `http://10.0.2.2:3000` → emülatör host localhost'una map'leniyor. A1.9A'nın debug manifest cleartext izni bu bağlantıyı mümkün kılıyor.

## Test edilen akışlar ve sonuçlar (hepsi backend log + ekran kanıtlı)

| # | Akış | Eylem | Backend kanıtı | UI sonucu | Durum |
|---|---|---|---|---|---|
| 1 | Uygulama açılışı | launch | `GET /api/health 200`, `GET /api/catalog 200` | Katalog yüklendi: Vegetarian Breakfast €10.00, Fresh Brewed Coffee €3.00 | **PASS** |
| 2 | Onboarding tercih diyalogu | açıldı | — | Dietary prefs (Vegan seçili), bütçe 12.00 EUR, Save/Cancel | **PASS** |
| 3 | AI chat (AI kapalı) | "vegan breakfast" gönder | `POST /api/sessions 201` → `POST /api/ai/chat 503` | `⚠️ Chat error (503): OpenAI not configured` | **PASS** (hata doğru gösterildi) |
| 4 | Ürün sepete ekleme | çipe dokun | (local) | qty 1, Subtotal 10,00 €, +/− butonları | **PASS** |
| 5 | Checkout (PayPal kapalı) | Checkout'a dokun | `POST /api/orders/create 503` | `⚠️ Checkout failed (503): PayPal not configured` | **PASS** |
| 6 | Sepet korunumu | başarısız checkout sonrası Cart aç | — | Sepet **korundu** (Vegetarian Breakfast qty 1) | **PASS** |
| 7 | Konuşmayı temizleme | Clear conversation | `DELETE /api/ai/chat/<sessionId> 200` | Hata baloncuğu temizlendi | **PASS** |
| 8 | Session persistansı | force-stop + relaunch | Session POST sayısı **1** (yeni yok) | Sadece catalog/health yeniden yüklendi | **PASS** (token kalıcı) |

## Sorunlar / riskler

**Kritik (P0):** Yok — hiçbir çökme, sessiz hata veya veri kaybı gözlemlenmedi.

**Gözlemlenen davranışlar (davranış değil, doğrulama):**
- AI ve PayPal kapalıyken (yerel S1 mod) ilgili hatalar kullanıcıya **açıkça** gösteriliyor (503 mesajları). Demo için gerçek OpenAI/PayPal anahtarları gerekir; yoksa akış bu noktada durur.
- Mojibake: PowerShell konsolunun UTF-8 göstermemesi kaynaklı ekran görüntüsünde değil, konsolda (`Ôé¼` gibi). Uygulamada `€` doğru render ediliyor. Yalnızca log okuma kozmetiği.

**Sınırlamalar (bu ortamda BLOCKED):**
- Gerçek PayPal onay→capture→webhook zinciri çalıştırılamadı: `PAYPAL_ENABLED=false`, credential/webhook ID yok. Sipariş oluşturma 503 ile duruyor (doğru fail-closed davranış).
- AI ile gerçek sepet hazırlama (tool-calling) çalıştırılamadı: `OPENAI_API_KEY` yok.

## Sonuç
Emülatörde uygulama kararlı çalışıyor. Session-auth (oluşturma + kalıcılık), katalog yükleme, sepet yönetimi, checkout hata yönetimi ve sepet korunma davranışları **hepsi doğru**. Hata akışları kullanıcıya şeffaf. Yapılacak düzeltme yok; eksik olan tek şey gerçek Sandbox/OpenAI kredential'ları olan tam E2E (ağımız dışı).

## Tekrar üretme adımları
```
cd apps/backend && npm run dev           # port 3000, PayPal/AI disabled
cd apps/flutter_app && flutter run -d emulator-5554
# app açılır; catalog gelir; chat/checkout 503'ü doğru gösterir
```
