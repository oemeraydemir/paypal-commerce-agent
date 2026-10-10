# AI Café — E2E Doğrulama Raporu

**Tarih:** 2026-10-09 (UTC)  
**Backend URL:** https://paypal-commerce-agent.onrender.com  
**Backend sürümü:** 1.0.0  
**APK:** `apps/flutter_app/build/app/outputs/flutter-apk/app-release.apk` (51.937.836 bayt)  
**Emülatör:** `emulator-5554` (çevrimiçi)

## 1. Yönetici Özeti

Production backend'in salt-okunur kontrolleri başarılıdır: health, catalog, webhook health ve dashboard HTTP 200 döndürdü. Release APK açıldı; ancak APK production backend'e değil `http://10.0.2.2:3000` adresine derlenmiş olduğundan katalog ve iki AI senaryosu production üzerinden çalıştırılamadı. Production ödeme akışına istek gönderilmedi.

## 2. Backend Yapılandırması

| Endpoint | Durum | Önemli değerler |
|---|---:|---|
| `/api/health` | HTTP 200 — PASS | `status=ok`, `version=1.0.0`, `environment=production`, `paypal.enabled=true`, `paypal.environment=sandbox`, `ai.enabled=true` |
| `/api/catalog` | HTTP 200 — PASS | 8 ürün; EUR fiyat aralığı €3,00–€45,00 |
| `/api/webhooks/health` | HTTP 200 — PASS | `webhookEnabled=false` |
| `/dashboard.html` | HTTP 200 — PASS | `Agent Control Center` işareti mevcut |
| `/api/policy-events?limit=5` | HTTP 200 — PASS | `total=0`, `events=[]` |
| `/api/policy-events/stats` | HTTP 200 — PASS | `totalRequests=0`, `allowed=0`, `blocked=0`, `spentMinor=0` (harcama €0,00) |

Ham yanıtlar `e2e-evidence/health.json`, `catalog.json`, `webhook-health.json`, `policy-events.json` ve `policy-stats.json` dosyalarındadır. Dashboard HTML yanıtı `e2e-evidence/dashboard.html` dosyasına kaydedilmiştir.

## 3. Senaryo 1 — ALLOW / REQUIRE_CONFIRMATION

**Girdi:** “Get breakfast for 1 person, vegetarian”  
**Sonuç:** **BLOCKED — production UI senaryosu çalıştırılmadı**

### Beklenen

- `veg_breakfast` (€10) + `coffee` (€3) = €13
- Politika kararı: `REQUIRE_CONFIRMATION`
- Backend'de policy event oluşması

### Gerçek

- Sepet toplamı ve politika kararı: **ölçülmedi**
- Backend event: **bulunamadı**; test sırasında production event listesi boştu
- İstek gönderilmedi. Release APK'nın API adresi production olmadığı için uygulama bu senaryoyu production backend'e yönlendiremezdi.

### Kanıt

- `e2e-evidence/catalog-load-failed.png`: uygulama ekranında backend/catalog bağlantı hatası
- `e2e-evidence/current-ui.xml`: UI hiyerarşisi
- `e2e-evidence/policy-events.json`: test anındaki event listesi boş

`scenario-1-cart.png` oluşturulmadı; başarılı sepet ekranı gözlemlenmedi.

## 4. Senaryo 2 — BLOCK

**Girdi:** “Prepare a cart with the premium chocolate cake”  
**Sonuç:** **NOT_TESTED**

### Beklenen

- Premium Chocolate Cake €45; €20 sınırı aşıldığı için `BLOCK`
- AI yanıtında limit açıklaması ve alternatif arama önerisi

### Gerçek

- Sepet, politika kararı ve AI mesajı: **ölçülmedi**
- Production chat isteği gönderilmedi; release APK yanlış backend adresine derlenmişti.

`scenario-2-block.png` oluşturulmadı; doğrulanmış BLOCK ekranı yoktur.

## 5. PayPal Sandbox Yönlendirmesi

**Girdi:** Senaryo 1 sepetindeki PayPal ödeme düğmesine tıklama  
**Sonuç:** **NOT_TESTED**

Health yanıtı PayPal yapılandırma ortamını `sandbox`, `paypal.enabled` değerini `true` olarak bildiriyor. Ancak ödeme düğmesi akışı production order oluşturma/PayPal çağrısı başlatabilir. Bu nedenle ödeme endpoint'ine erişilmedi, PayPal düğmesine basılmadı ve sandbox onay URL'si gözlemlenmedi.

- Tarayıcı açıldı: **hayır**
- Approval URL/token: **yakalanmadı**
- `scenario-3-paypal-approval.png`: **oluşturulmadı**
- Onay/capture/gerçek ödeme: **yapılmadı**

## 6. Dashboard İstatistikleri

Test anındaki snapshot:

| Metrik | Değer |
|---|---:|
| `totalRequests` | 0 |
| `allowed` | 0 |
| `blocked` | 0 |
| `spentMinor` | 0 |
| Harcama | €0,00 |

Bu değerler `/api/policy-events/stats` yanıtından alınmıştır; `policy-stats.json` dosyasında saklanır. İki UI senaryosu çalıştırılmadığı için bu testlerden yeni policy event oluşmadı.

## 7. Kalan Manuel Adımlar

1. Flutter release APK'sını doğru backend URL'siyle yeniden oluşturup emülatöre kurun. Mevcut kaynak varsayılanı ve incelenen release APK'daki adres `http://10.0.2.2:3000`; production E2E için `https://paypal-commerce-agent.onrender.com` olarak yapılandırılmalıdır.
2. Doğru yapılandırılmış APK ile katalog ve iki AI/policy senaryosunu yeniden çalıştırın.
3. Ödeme/approval testinden önce production servisin gerçek PayPal ortamını ve ödeme uçlarının etkisini manuel olarak doğrulayın. Gerçek checkout/approval işlemini yalnızca ayrıca yetkilendirildikten ve sandbox olduğundan emin olunduktan sonra çalıştırın.
4. Buyer hesabı, PayPal approval, purchase completion ve harcama doğrulaması kullanıcı tarafından yapılmalıdır.
5. İsteğe bağlı webhook registration ve video/Devpost işleri bu doğrulamada yapılmadı.

## 8. Bilinen Sınırlamalar

- Release APK, `api_service.dart` içindeki `http://10.0.2.2:3000` varsayılanına derlenmiş. APK'nın native kitaplıklarında bu adres bulundu, `onrender.com` bulunmadı. Emülatör ekranında “Backend unavailable” ve catalog yükleme hatası görüldü.
- Android cihaz `emulator-5554` çevrimiçiydi; uygulama başlatma komutu başarılı oldu.
- `flutter-logs.txt`, istenen Flutter logcat filtrelemesinin son 500 satırını içeriyor; bu filtrede yalnızca Flutter renderer başlangıç girdisi vardı.
- `backend-logs.txt` içinde belirtildiği üzere Render servis loglarına erişim için yetkili Render CLI/API erişimi yoktu; public backend uçları log döndürmüyor.
- `policy-events` ve stats test sırasında boş/sıfırdı.
- PayPal webhook health `webhookEnabled=false` bildirdi; gerçek HTTPS webhook teslimatı test edilmedi.
- PayPal Developer Dashboard, hesap oluşturma ve PayPal approval yapılmadı.
- Checkout/ödeme endpoint'leri çağrılmadı; approval URL elde edilmedi.

## 9. Kanıt Dosyaları

`e2e-evidence/` dizininde:

- JSON: `health.json`, `catalog.json`, `webhook-health.json`, `policy-events.json`, `policy-stats.json`, `test-timestamps.json`
- Ekran görüntüleri: `app-launch.png`, `catalog-load-failed.png`
- Diğer: `current-ui.xml`, `flutter-logs.txt`, `backend-logs.txt`, `dashboard.html`

Test başlangıç/bitiş zamanları ve test edilmeyen senaryolar `test-timestamps.json` dosyasına kaydedildi. Senaryo 1/2/3 için başarılı işlem kanıtı veya screenshot üretilmedi.

## 10. Sonuç

**Genel durum: PARTIALLY_VERIFIED**

Production backend'in salt-okunur sağlık, katalog, webhook, dashboard ve policy snapshot kontrolleri başarılıdır. Flutter APK açıldı; fakat yanlış API base URL nedeniyle istenen production UI senaryoları çalıştırılamadı. Production ödeme akışı özellikle çalıştırılmadı.

**Önerilen sonraki adım:** Production backend URL'siyle derlenmiş release APK'yı sağlayıp önce ödeme dışı UI/policy senaryolarını yeniden doğrulayın.
