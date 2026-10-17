# AI Café — Deployment & Demo Runbook (S11 kapanış → Demo doğrulama)

**Amaç:** S11 kapatıldıktan sonra jüriye gösterilecek **gerçek çalışan uçtan uca akışı** kanıtlamak.
Bu runbook, ajanın yapamadığı (hesap/secret/gizli anahtar/hardware gerektiren) adımları **senin** tek tek yürütebilmen için yazıldı.

> Durum etiketleri: ✅ **Ajan yaptı/doğruladı** · 🧑 **Senin hesabın/secret'ın gerekiyor**

---

## Bölüm 0 — Hazırlık (ajan tarafından hazırlandı) ✅

| Araç | Ne yapar | Nerede |
|---|---|---|
| `npm test` | Tam backend test paketi (normal ortamda 143/143) | `source/apps/backend` |
| `npm run e2e:smoke` | Yerel uçlar smoke testi (7/7) — ✅ doğrulandı | `source/apps/backend` |
| `npm run verify:deployment <url>` | Canlı deploy'ı 8 maddede doğrular | `source/apps/backend` |
| `npm run e2e:sandbox <url>` | GERÇEK AI→policy→PayPal→capture akışını sürer | `source/apps/backend` |
| `npm run register-webhook <url>` | PayPal webhook kaydı → `PAYPAL_WEBHOOK_ID` | `source/apps/backend` |
| `verify.sh` | Tek komutla tüm yerel doğrulama | repo kökü |
| `.github/workflows/ci.yml` | CI'da gerçek 143/143 + build artifact kontrolü | repo kökü |
| `.env.render.example` | Render env şablonu (secret yok) | `source/apps/backend` |

**S11 kapanışında düzeltilen 2 gerçek deployment blocker'ı (commit `d613f34`):**
1. `package.json` `main`/`start` artık `dist/src/server.js` (önce `dist/server.js` → Render'da MODULE_NOT_FOUND).
2. `build` artık `public/` klasörünü `dist/public`'a kopyalıyor (önce prod'da `/dashboard.html` 404).

---

## Bölüm 1 — Deployment değişikliklerini Git'e kaydet ✅ (yapıldı)

Repo başlatıldı, `.workbuddy-ai/` ignore edildi, `.env` git dışında. Değişiklikler `fix/render-deployment` dalında commit edildi.

```bash
cd paypal-commerce-agent
git log --oneline -1        # d613f34 fix(deploy): correct Render entry path and ship dashboard assets in build
git show --stat HEAD        # diff özeti
```

**Diff'i incele (istediğin gibi):**
```bash
git show HEAD -- source/apps/backend/package.json
```
Beklenen çıktı (yalnızca 3 satır değişir):
```diff
-  "main": "dist/server.js",
+  "main": "dist/src/server.js",
-    "build": "tsc -p tsconfig.json",
+    "build": "tsc -p tsconfig.json && node -e \"...fs.cpSync('public','dist/public',...)\"",
-    "start": "node dist/server.js",
+    "start": "node dist/src/server.js",
```

**Remote'a gönder (senin GitHub/GitLab hesabın):** 🧑
```bash
git remote add origin <your-public-repo-url>
git push -u origin fix/render-deployment
```
> Secret kontrolü: `.env` commit edilmedi; yalnızca `.env.example` ve `.env.render.example` (ikisi de secretsız) takipte.

---

## Bölüm 2 — Render'a deploy 🧑

### 2.1 Render servisi oluştur
1. https://dashboard.render.com → **New** → **Blueprint** (repo'da `source/apps/backend/render.yaml` var).
2. Repo'yu bağla; Render `render.yaml`'ı okuyup servisi kurar:
   - `rootDir: source/apps/backend`, `buildCommand: npm install && npm run build`, `startCommand: npm start`
   - `NODE_ENV=production`, `PORT=10000`, `PAYPAL_ENABLED=true`, `PAYPAL_ENV=sandbox`
3. **PayPal sandbox credentials** (Developer Dashboard → Sandbox → Apps & Credentials):
   - `PAYPAL_CLIENT_ID` → **secret olarak gir**
   - `PAYPAL_CLIENT_SECRET` → **secret olarak gir**
4. **OpenAI**: `OPENAI_API_KEY` → **secret olarak gir**
5. `CORS_ORIGIN` değerini gerçek servis URL'inle güncelle (örn. `https://ai-cafe.onrender.com`).
6. Deploy'u bekle. Loglarda görmelisin:
   ```
   copied public/ -> dist/public
   🚀 Server running on port 10000
   ```

> ❗ Gerçek anahtarları **asla** kaynak koduna, `.env.render.example`'a veya git'e koyma. Sadece Render panelindeki secret alanına gir.

### 2.2 Deploy'u doğrula ✅ (script hazır)
```bash
cd source/apps/backend
npm run verify:deployment https://<your-service>.onrender.com
```
Beklenen: **8/8 PASS** ve `health` satırında `ai.enabled=true paypal.enabled=true`.
> Eğer `ai.enabled=false` veya `paypal.enabled=false` görürsen → ilgili env değişkeni Render'da eksik demektir.

### 2.3 Webhook kaydı 🧑 (kritik: `PAID`'in webhook ile gelmesi için)
```bash
npm run register-webhook https://<your-service>.onrender.com/api/webhooks/paypal
```
Çıktıdaki `PAYPAL_WEBHOOK_ID=...` değerini Render paneline **ekle** (secret), servisi yeniden başlat.
Doğrula:
```bash
curl -s https://<your-service>.onrender.com/api/webhooks/health   # webhookEnabled: true olmalı
```

---

## Bölüm 3 — Gerçek sandbox akışını çalıştır 🧑 + ✅ (script hazır)

**Bölüm 3a — otomatik kısım** (AI + policy + order create + spent kuralı):
```bash
cd source/apps/backend
npm run e2e:sandbox https://<your-service>.onrender.com
```
Script sırayla şunu yapar ve **her adımı ekrana yazar**:
- `health` preconditions (ai/paypal enabled) — değilse dürüstçe ABORT eder.
- AI isteği #1 → aşırı pahalı sepet → **BLOCK** beklenir.
- AI isteği #2 → küçük sepet → **allow/confirmation** beklenir.
- `POST /api/orders/create` → gerçek PayPal sandbox order + `approvalUrl` yazdırır.
- Capture ÖNCESİ `spent` (artmamalı).
- Capture denemesi.

**Bölüm 3b — insan adımı** (pazarlık edilemez):
1. Script'in yazdırdığı `approvalUrl`'i tarayıcıda aç.
2. **PayPal Sandbox buyer** ile giriş yap ve **Approve** et.
3. Script artık **otomatik olarak bekler** ve onay sonrası capture'ı yapar:
   - `E2E_APPROVAL_TIMEOUT_MS` (varsayılan 180s) boyunca 10s'de bir capture'ı dener.
   - Onay gelene kadar PayPal `ORDER_NOT_APPROVED` döner (geri kazanılabilir, script bekler).
   - Onay sonrası `200 PAID` (veya `409 already captured`) ile başarı raporlar.
   - Süre dolarsa dürüstçe `TIMEOUT` yazar ve **spent artmaz** (doğru davranış).
4. `spent` değerinin **sadece** capture başarılı olduktan sonra arttığını doğrula.

> **Neden bu düzeltme önemli:** Script'in ilk sürümü onaydan hemen sonra capture deniyordu; bu gerçek akışta `ORDER_NOT_APPROVED` → backend `400 Payment failed` (definitive failure) döndürür ve **asla `PAID`'e ulaşamazdı**. Bağımsız kaynak incelemesinde bulundu ve düzeltildi (commit `00209e3`).

**Bölüm 3c — webhook ile `PAID`** (isteğe bağlı ama jüri için güçlü):
- Webhook kayıtlıysa, capture sonrası PayPal `PAYMENT.CAPTURE.COMPLETED` gönderir → order `PAID`.
- Dashboard'da `Spent` artışını ve policy event'lerini gör.

> **Dürüst ayrım (senin vurgun):** Mock'lu `tests/integration/e2e-demo-flow.test.ts` uygulamanın **kontrol akışını** doğrular; gerçek PayPal capture + webhook'un çalıştığını **tek başına kanıtlamaz**. Bunu yalnızca Bölüm 3b/3c (gerçek sandbox + buyer) kanıtlar.

---

## Bölüm 4 — 3 dakikalık demo videosu 🧑

**Kural:** çalışmayan bir adımı kurguyla çalışıyormuş gibi göstermek **yok**. Çekim gerçek emülatör + gerçek dashboard ile.

### Ön kontrol (çekimden hemen önce)
- [ ] Render public URL açılıyor (`verify:deployment` 8/8).
- [ ] `/dashboard.html` canlı açılıyor.
- [ ] Gerçek AI isteği policy **BLOCK** + retry davranışını gösteriyor.
- [ ] PayPal Sandbox ödemesi gerçekten tamamlanıyor (buyer approve).
- [ ] Webhook sonrası order **PAID**.
- [ ] `Spent` yalnızca başarılı ödeme için artıyor.
- [ ] Dashboard'da gerçek event'ler görünüyor.
- [ ] 2 başarısız test normal CI/yerel ortamda tekrar çalıştırılıp **143/143** alındı (bkz. Bölüm 5).

### Çekim senaryosu (okunacak sıkı anlatım)
| Zaman | Sahne | Söylenen |
|---|---|---|
| 0:00–0:20 | Problem (Flutter sohbet) | "AI agents can increasingly shop… what is it actually allowed to buy?" |
| 0:20–0:45 | Dashboard policy kartları | Max purchase €20 · Daily limit €100 · Alcohol blocked |
| 0:45–1:20 | AI €45 sepeti → **BLOCK** | Control Center'da BLOCK event (MAX_PURCHASE_EXCEEDED) |
| 1:20–1:50 | AI adapte olur, **€13.00 (veg breakfast + coffee) → REQUIRE_CONFIRMATION** → Confirm | |
| 1:50–2:20 | PayPal Sandbox approve/capture → webhook → **PAID** | |
| 2:20–2:45 | Dashboard: Requests 3 / Allowed 2 / Blocked 1 / **Spent €13.00** | BLOCK ve ALLOW event satırları |
| 2:45–3:00 | Final | "The AI can shop. Your policies decide what it can buy. And you still control the payment." |

Çekim sonrası: `SUBMISSION.md` içine video URL + repo URL + canlı URL'yi yaz.

---

## Bölüm 5 — Test sınırının kapatılması (141/143 → 143/143)

**Neden 2 test ajan oturumunda fail oldu:** `tests/unit/environment.test.ts` gerçek bir child process `spawn` eder (`spawnSync`). Kısıtlı ajan sandbox'ı child process üretemiyor → `spawnSync` **EBUSY** (tarafsız kanıt: saf `node -e "0"` spawn'ı bile EBUSY). **Ürün hatası değil.** Testin beklediği mantık ayrıca `dist` üzerinden birebir doğrulandı (byte-identical çıktı).

**143/143'ü almak için (senin makinen veya CI):**
```bash
cd source/apps/backend
npm ci
npx tsc --noEmit -p tsconfig.json
npm test          # beklenen: Tests 143 passed / 143 total
npm run build
```
veya repo kökünde bir komutla:
```bash
./verify.sh
```
CI otomatikleştirmesi: `.github/workflows/ci.yml` push/PR'da `npm test` + build artifact kontrolü çalıştırır.

---

## Bölüm 6 — Kontrol listesi (tek bakışta)

| # | Madde | Durum | Kim |
|---|---|---|---|
| 1 | Deployment diff incelendi + commit | ✅ | Ajan |
| 2 | Render deploy + secret env | 🧑 | Sen |
| 3 | `verify:deployment` 8/8 | ✅ araç hazır / 🧑 çalıştır | Sen |
| 4 | Webhook kaydı + `PAYPAL_WEBHOOK_ID` | 🧑 | Sen |
| 5 | Gerçek AI BLOCK + retry | 🧑 | Sen |
| 6 | Gerçek PayPal capture (buyer approve) | 🧑 | Sen |
| 7 | Webhook sonrası PAID | 🧑 | Sen |
| 8 | `Spent` yalnızca PAID'de artıyor | ✅ mantık testli / 🧑 canlı | Sen |
| 9 | Dashboard gerçek event | ✅ | Ajan |
| 10 | 2 test normal ortamda tekrar | ✅ araç hazır / 🧑 çalıştır | Sen |
| 11 | 3 dk video (kurgusuz) | 🧑 | Sen |

---

## Nihai karar

**S11: kapatıldı. S12: açılmıyor.** Proje **özellik geliştirme → deployment & demo doğrulama** fazına geçti.
En yüksek değerli iş yeni kod değil, jüriye gösterilecek **gerçek çalışan uçtan uca akış**.
