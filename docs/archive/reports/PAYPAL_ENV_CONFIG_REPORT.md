# PAYPAL_ENABLED / PAYPAL_ENV — Kod Yorumu & Canlı Sandbox Etkisi Raporu

**Kapsam:** Salt-okunur. Kod/konfig değişikliği yapılmadı; commit/push/deploy yapılmadı.
**Repo:** `C:\Projects\FinCan\paypal-commerce-agent` · Branch `fix/render-deployment` · HEAD `c8c5a40` (değişmedi).
**Tetik:** Render panelinde `PAYPAL_CLIENT_ID/SECRET`, `PAYPAL_WEBHOOK_ID`, `OPENAI_API_KEY`, `CORS_ORIGIN` tanımlı; **`PAYPAL_ENABLED` ve `PAYPAL_ENV` listede görünmüyor.**

---

## 1. Kısa cevap (öncesi)

Render'da **`PAYPAL_ENABLED` tanımlı olmasa bile PayPal fiilen ETKİNDİR**, çünkü açma kapısı kodda `NODE_ENV === 'production'` **veya** `PAYPAL_ENABLED === 'true'` koşulu. Render Node runtime'ı (ve `render.yaml`) `NODE_ENV=production` verdiği için `PAYPAL_ENABLED`'ın etkisi production'da sıfırlanır. `PAYPAL_ENV` ise kodda `z.literal('sandbox')` + sabit `https://api.sandbox.paypal.com` ile **kilitlenmiştir — canlı para mümkün değildir.** Yani:
- Fonksiyonellik açısından: canlı Render'da checkout Sandbox'e bağlanır (S1/kapalı mod geçersiz).
- Operasyonel açıdan: panel `PAYPAL_ENABLED` göstermediği için operatör "kapalı" sanabilir — **yanıltıcı bir sürpriz**.

Doğrulanamayanlar: tanımlı credential'ların gerçekten geçerli Sandbox anahtarları olması, `PAYPAL_WEBHOOK_ID`'nin uyuşması, dağıtılan commit — değerler gizli.

---

## 2. Değişkenlerin koddaki okunuşu ve varsayılanları

| Değişken | Tanım (environment.ts) | Varsayılan | Zorunlu mu? |
|---|---|---|---|
| `PAYPAL_ENABLED` | `z.enum(['true','false']).default('false')` (L13) | **`'false'`** | Hayır |
| `PAYPAL_ENV` | `z.literal('sandbox').default('sandbox')` (L38) | **`'sandbox'`** (tek izinli değer) | Hayır |
| `PAYPAL_CLIENT_ID` | `z.string().min(1)` (L35) | — | PayPal açıksa **evet** |
| `PAYPAL_CLIENT_SECRET` | `z.string().min(1)` (L36) | — | PayPal açıksa **evet** |
| `PAYPAL_WEBHOOK_ID` | `z.string().optional()` (L47) | — | Hayır (sadece imza doğrulama/health) |
| `NODE_ENV` | `z.enum([...]).default('development')` (L10) | `'development'`; Render'da **`production`** | — |

## 3. Açma kapısı — kritik mantık (L54–57, L74)

```ts
let paypalEnv: ... | null = null;
if (baseEnv.NODE_ENV === 'production' || baseEnv.PAYPAL_ENABLED === 'true') {
  paypalEnv = paypalSchema.parse(process.env);   // credential'lar ZORUNLU olur
}
...
isPayPalEnabled: (): boolean => paypalEnv !== null,
```

**Sonuç tablosu:**

| Ortam | PAYPAL_ENABLED | NODE_ENV | `paypalEnv` | isPayPalEnabled() | Davranış |
|---|---|---|---|---|---|
| Yerel dev (emülatör testi) | tanımsız→`false` | `development` | `null` | **false** | S1/kapalı; checkout 503 (emülatörde görüldü) |
| Yerel dev, açık | `true` | `development` | parse edilir | **true** | credential şart; Sandbox |
| **Canlı Render** | **tanımsız→`false`** | **`production`** | **parse edilir** | **true** | **Sandbox checkout AKTİF** |
| Canlı Render, cred yoksa | — | `production` | **parse THROW** | — | **uygulama başlamaz (crash-loop)** |

Kritik çıkarım: **`PAYPAL_ENABLED` sadece production-dışı ortamlarda anlamlıdır.** Render'da `NODE_ENV=production` kapıyı kendiliğinden açar; `PAYPAL_ENABLED` listede olmasa da checkout çalışır.

## 4. `PAYPAL_ENV` neredeyse kozmetik — Sandbox kodu kilitlemiş

- `client.ts:40` `environment: Environment.Sandbox` (sabit, env'den okunmuyor).
- `client.ts:88-89` `baseUrl(): 'https://api.sandbox.paypal.com'` (sabit).
- `health.ts:22` yanıt sadece `env.paypal?.PAYPAL_ENV ?? 'sandbox'` gösterir; davranışı değiştirmez.
- `environment.ts:38` `z.literal('sandbox')` → bu değer dışında bir şey girilirse **şema hatası**.

Sonuç: `PAYPAL_ENV` düzgün ayarlanmasa bile uygulama **her zaman Sandbox'e** bağlanır; yapılandırma ile canlı para moduna geçilemez. Bu bir **güvenlik kazancı**.

## 5. Canlı doğrulama kısıtları (açıkça belgelendi)

Render'da olan ve olmayanın etkisi:
- `PAYPAL_ENABLED`/`PAYPAL_ENV` eksikliği **fonksiyonu bozmaz** (yukarıdaki kapı mantığı).
- Ancak **panelde görünmemesi**, canlı servisin muhtemelen bu `render.yaml`'dan (blueprint) değil, **elle oluşturulmuş** olabileceğine işaret eder — bu aynı zamanda "hangi commit dağıtıldı" sorusunu açık bırakır.
- `PAYPAL_WEBHOOK_ID` tanımlı olsa bile, imza doğrulama **yalnızca** doğru webhook ID'si + endpoint'in PayPal'de kayıtlı olmasıyla çalışır; kayıt/teslim durumu bu ortamdan doğrulanamaz.

## 6. Riskler ve öneriler

**Riskler:**
1. (Operasyonel) `PAYPAL_ENABLED` görünmez → operatör kapalı sanır, ama Sandbox checkout açıktır. Beklenmedik ödeme denemesi.
2. (Kullanılabilirlik) Production'da credential eksikse uygulama **crash-loop**'a girer (fail-closed ama tam kesinti).
3. (Gözlemlenebilirlik) Açık/kapalı durumu tek gerçek kaynağı `GET /api/health` → `paypal.enabled` + `environment`; panel değil.

**Öneriler (bu sprintte UYGULANMADI):**
- `render.yaml`'ı panel durumuyla uzlaştır: blueprint ile dağıt veya `PAYPAL_ENABLED=true`, `PAYPAL_ENV=sandbox` değerlerini panele ekle (bilgi amaçlı, davranışı zaten production ile açık).
- Startup'ta tek satır log: `PayPal enabled=<bool> env=<sandbox> webhookId=<var/yok>` (secret yazmadan) — health yerine de erişilebilir gözlemlenebilirlik.
- Health yanıtına `buildCommit` (A1.5) + bu PayPal alanları birlikte "canlı durum kanıtı" olarak kullanılmalı; commit SHA'sı da böylece teyit edilebilir.

## 7. Doğrulanamayanlar (UNVERIFIED)
Tanımlı credential'ların geçerliliği · `PAYPAL_WEBHOOK_ID` uyuşması · webhook'un PayPal'de kayıtlı olması · canlıda onay→capture→webhook zinciri · dağıtılan commit SHA'sı. Hepsi gizli değer veya erişim gerektirdiğinden bu ortamda doğrulanamaz.
