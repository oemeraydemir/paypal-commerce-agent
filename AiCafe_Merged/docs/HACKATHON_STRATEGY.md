# AI Café — PayPal AI Hackathon Stratejisi (Faz 0)

Hackathon: **PayPal AI Hackathon — "Build what's next with PayPal and AI"** (Devpost)
- Deadline: **12 Kasım 2026, 21:00 GMT+1** (~9 gün)
- Ödül havuzu: $67.500+ nakit + sponsor ödülleri
- Tek temel gereksinim: proje **PayPal'ı ve AI'ı anlamlı şekilde birlikte kullanmalı**.

## Jüri kriterleri → AiCafe'nin mevcut karşılığı

| Kriter | AiCafe | Durum / boşluk |
|---|---|---|
| **Teknolojik Uygulama** (PayPal + AI, çalışan ve önemsiz olmayan uygulama) | PayPal Sandbox (order/capture + webhook + refund), 6 AI sağlayıcı (Gemini, Groq, Cerebras, OpenRouter, OpenAI) fallback zinciriyle | ✅ Güçlü. "PayPal+AI" çekirdeği zaten derin. |
| **Design** (tamamlanmış, tutarlı ürün deneyimi — teknik PoC değil) | Web checkout + Flutter + merchant dashboard (AG Grid) | 🟡 Flutter UI düzeltmeleri sürüyor (Faz 2 +). Web/Flutter tutarlılığı vurgulanmalı. |
| **Potansiyel Etki** (gerçek sorun, gerçek kitle) | Grupça (Split Bill) / AI destekli kafe siparişi + güvenli ödeme | ✅ Hikâye hazır: "üç arkadaş, bir kahve siparişi". |
| **Yenilikçilik / Fikir** (mevcut kavramlardan farklılaşma) | AI sipariş agenti → sunucuda doğrulanmış sepet → grup ödemesi → pickup handoff | 🟡 "Agentic Commerce" açısı anlatılmalı; demo bunu kanıtlamalı. |
| **Sunum** (video uçtan uca; sorun/kitlenin/önem net) | 3 dk dan kısa YouTube videosu gerekli | ❌ Henüz yok (Faz 4). |

## Hedeflenecek ödüller (gerçekçi sıralama)

1. **Best Use of PayPal + AI** ($5.000) — çekirdek uyum.
2. **Best Use of Agentic Commerce** ($5.000) — AI sipariş agenti + doğrulanmış grup ödemesi tam olarak bu tema.
3. **Best Use of AG Grid** ($5.000/$2.000/$1.000) — dashboard **ag-grid-community@33.0.0** kullanıyor ✅ (mevcut varlık, ekstra iş gerektirmez; demo'da gösterilmeli).
4. **Best Demo Delivery** ($5.000) — video kalitesi.
5. **Best Use of Render** ($1.000 kredi) — `render.yaml` mevcut ✅; hosted demo URL buradan.
6. İkincil: **Most Creative / Most Impactful** ($5.000'er).

Karar: tek bir "ödül avı"na değil, **PayPal+AI+Agentic Commerce+AG Grid** dörtlüsüne yaslan. Video ve dokümantasyon bu dört ekseni de görünür kılmalı.

## Teslim gereksinimleri — durum

| Gereksinim | Durum | Eylem |
|---|---|---|
| Public repo + **lisans dosyası** | `LICENSE` mevcut ✅ | Repo'nun public olduğunu doğrula. |
| **Kurulum talimatları** / hosted demo | `README.md` + `render.yaml` mevcut ✅ | Render üzerine canlı deploy + URL sağla. |
| **Fonksiyonel demo** (çalışan build) | Backend + Flutter çalışıyor | Canlı URL (Render) + yerel kurulum rehberi. |
| **Demo video** (<3 dk, YouTube, herkese açık) | ❌ | Faz 4'te üret. |
| **Text description** (özellikler/işlev) | Kısmen | Gönderim formu için sıkı + tanımlayıcı metin. |
| **Tools** (hangi AI modeli/servisi, nasıl kullanıldı) | 6 sağlayıcı: Gemini/Groq/Cerebras/OpenRouter/OpenAI + PayPal SDK + AG Grid + Render | Gönderimde açıkça listele. |

## Kurallara uyum notları
- "PayPal ve AI'ı anlamlı kullanma" şartı karşılanıyor (PayPal SDK/sandbox + AI agenti).
- Sponsor araç kullanımı **zorunlu değil**; AG Grid + Render avantaj olarak kullanılıyor.
- Video: üçüncü taraf ticari marka/telifli müzik yok.

## Brd (9 güne dağılmış)
1. **Faz 1** (bugün/yarın): Gerçek PostgreSQL smoke suite'leri (Split Bill atomicity, durability, mandate, pickup). Kayıt kanıtı olmadan "kalıcılık" iddiası zayıf.
2. **Faz 3** (2-3 gün): Canlı Sandbox'ta Split Bill (2 kişilik pay ödeme) + refund + başarısız ödeme. `PAYMENT_E2E.md`'yi güncelle.
3. **Faz 4** (son 3-4 gün): Render deploy + demo videosu (3 dk, Agentic Commerce + AG Grid + PayPal akışı) + Devpost gönderim formu + public repo doğrulaması.
4. **Faz 2** (paralel): Web/Flutter Split Bill akışının uçtan uca tutarlılığını bitir.
