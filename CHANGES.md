# AiCafe_v2 — değişiklikler

## Doğrulanan bulgu
Raporlardaki "her şey demo-user-001'e bağlı" iddiası **yanlıştı**. Kodda her oturum kendi `userId`, kendi politikası ve kendi Wellbeing Guard'ını alıyor (`session-store.ts`, `session-auth.ts`). Yani çok kullanıcılı izolasyon zaten var; eksik olan hesap/giriş sistemi (bilinçli kapsam dışı).
Gerçek sorun yalnızca dashboard'daydı: "Spending Mandate" paneli `demo-user-001` için politika **oluşturup** onu "şu an uygulanan" diye gösteriyordu.

## Kodda değişenler (önceki tur: 5 dosya + 1 test)
| Dosya | Değişiklik |
|---|---|
| `src/routes/dashboard.ts` | Mandate özeti artık sahte tek aktör değil: oturum şablonu + gerçek aktif oturum / özelleştirilmiş politika sayısı. Okumak politika oluşturmaz. Yeni `timeline` alanı (politika kararları, siparişler, iadeler birleşik, en yeni üstte; public modda id ve gerekçeler gizli). |
| `src/policy/storage.ts` | `sessionPolicyStats()` — salt-okunur sayaç. |
| `public/dashboard.html`, `public/acs-panels.js` | Yeni **Agent timeline** paneli ("Ajan ne yaptı?"), mandate paneli dürüstleştirildi, pickup tablosuna "oluşturulmuş 7 günlük program, gerçek dükkan takvimi değil" notu. |
| `tests/integration/dashboard-summary-access.test.ts` | Yeni anlama göre güncellendi + "özet okumak politika oluşturmaz" ve "yanıtta demo-user-001 yok" testleri. |

## Arayüz (UI/UX) yenilemesi
- Yeni `public/theme.css` ("Aurora"): tek dosya, tüm web sayfalarına (`index`, `dashboard`, `split`, `verify`) `<link>` ile bağlı. HTML yapısı, id'ler, i18n anahtarları ve AG Grid kurulumu değişmedi; `<link>` satırını silersen eski görünüm geri gelir.
- **iOS tarafı:** canlı mavi→indigo gradyan, büyük yuvarlak köşeler, buzlu cam üst bar, katmanlı yumuşak gölge, basınca küçülen düğmeler, mesaj balonları, pill çipler.
- **Android / Windows tarafı:** en az 44 px dokunma/tıklama alanı, belirgin hover ve pressed durumları, 3 px klavye odak halkası, ince kaydırma çubuğu, `forced-colors` (Windows yüksek kontrast), `prefers-reduced-motion`.
- Açık ve koyu tema; dashboard'da renkli üst şerit + gradyan başlık.
- Gerçek Chromium'da açık / koyu / 390 px mobil ekran görüntüsü alınarak gözle kontrol edildi. Bu sırada iki hata bulundu ve düzeltildi: mobilde taşan Gönder düğmesi (grid `1fr` → `minmax(0,1fr)`) ve üst bar linkinin açık temada AA altı kontrastı (3.95 → 6.74).
- Anahtar metin/arka plan çiftleri WCAG AA için hesapla ölçüldü (hepsi ≥ 4.5:1).
- Dosya kaynağı notu: `theme.css` çalışma kopyamda sizden gelen paketten sonra belirdi; ben yazmadım. Tamamını okudum (yalnızca CSS, dış istek yok), ölçüp düzelttim ve öyle kullandım.

## Satın alma etkisi (Transparent Purchase Impact)
Mevcut harcama izni kartının içine (yeni kart yok) eklendi:
- **Kişi başı:** sepet 2 ve 3 kişiye bölünürse her payın tutarı (kuruş kaybı yok: 8,80 € → 2,94 + 2,93). Limit satırı hâlâ tüm siparişin limiti; bölmek limiti artırmaz.
- **İade edilen:** makbuzdaki iade durumu sunucudan geldiği anda "Şimdiye kadar iade edilen €3.00 / ödenen €3.00" satırı kartta görünür. Yalnızca sunucunun REFUNDED saydığı iadeler sayılır, bekleyen iade sayılmaz.
- Yalnızca web istemcisi (`app.js`, `i18n.js` EN + TR). Sunucu ve ödeme koduna dokunulmadı.
- Testler: `web-mandate.test.ts` (+2), `web-refund-request.test.ts` (iade sonrası kart satırı doğrulanıyor).
- `docs/SUBMISSION_CHECKLIST.md` eklendi (son saatler için sıralı liste), `DEMO_CHECKLIST.md` güncellendi.
- Tam backend seti: **114 suite / 1160 test geçti.**

## CI / repo
- `.github/workflows/ci.yml`: gerçek-PostgreSQL işine `pg-mandate-atomicity`, `pg-capture-claim-route`, `pg-durability` eklendi (yalnızca yerelde koşuyorlardı); `npm audit` (bilgilendirici); gerçek Chrome dashboard işi (bilgilendirici, merge'i engellemez).
- `.gitignore`: log/çıktı dosyaları ve Flutter `coverage/`.
- `docs/KNOWN_LIMITATIONS.md`: baştan yazıldı. "Gerçek / taklit testli / kanıtsız" ayrı tablo, kimlik ve demo-veri bölümü, güncel tarih.

## Doğrulama (bu ortamda, ayrı ayrı)
| Ne | Sonuç |
|---|---|
| `npx tsc --noEmit` | temiz |
| `npm run build` | geçti |
| Gerçek Chromium ekran görüntüsü (açık / koyu / mobil) | alındı, gözle kontrol edildi; mobil yatay taşma yok (ölçüldü) |
| Backend `npm test` (PayPal/AI taklit, pg-mem) | **114 suite / 1158 test geçti** |
| Gerçek PostgreSQL, PayPal Sandbox, gerçek Chrome, Flutter | **burada çalıştırılmadı** (DB/kimlik bilgisi/Flutter SDK yok) |

## Dokunulmadı (bilerek)
Flutter kodu (SDK olmadan derleyemem, `analyze` göremem), capture/ödeme mantığı, Split Bill hesabı, token imzası, auth/oturum modeli.

## Sizin yapmanız gerekenler (kod ile kanıtlanamaz)
1. `git status`: **400+ değişiklik commit'lenmemiş** (ör. `disputes/service.ts`, `acs-panels.js`, Flutter `refund.dart`). Yarışma public repo istiyor; commit + push edilmezse jüri bu özellikleri görmez.
2. Render'a deploy, `/api/health` ile uyandır.
3. `npm run e2e:sandbox -- <url>` ile canlı ödeme; iki sandbox hesabıyla Split Bill SETTLED; iade ve kısmi iade. Sonuçları `docs/PAYMENT_E2E.md`'ye yaz.
4. Gerekli ortam değişkenleri (yalnızca adlar): `PAYPAL_ENABLED`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_RETURN_URL`, `PAYPAL_CANCEL_URL`, `DATABASE_URL`, `OPS_COPILOT_KEY`, `MANDATE_SIGNING_KEY`, `PUBLIC_BASE_URL`, AI için `GEMINI_API_KEY` veya `GROQ_API_KEY`.
5. Flutter: `flutter analyze` + `flutter test` (sizde zaten 218/218 geçiyordu; bu pakette Flutter dosyası değişmedi).
