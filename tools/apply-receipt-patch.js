#!/usr/bin/env node
/* Receipt QR + table cards: anchor-based patch. Run from the repo root (the folder that holds "source").
 *   node tools/apply-receipt-patch.js
 * It edits your CURRENT files in place (so newer work such as the cold-return recovery stays intact),
 * keeps each file's line endings, skips edits that are already applied, and reports any anchor it
 * cannot find instead of guessing. Nothing is written for a file with a missing anchor. */
const fs = require('fs');
const path = require('path');
const EDITS = [
 {
  "file": "source/apps/backend/src/routes/mandates.ts",
  "name": "crypto import",
  "done": "from 'crypto'",
  "old": "import { Router } from 'express';\n",
  "new": "import crypto from 'crypto';\nimport { Router } from 'express';\n"
 },
 {
  "file": "source/apps/backend/src/routes/mandates.ts",
  "name": "public share-link route",
  "done": "'/mandates/public'",
  "old": "// Public keys (active + previous).",
  "new": "// Receipt QR / share link target. The link carries the order id and the Ed25519 signature of that\n// order's mandate. Only someone who was handed the link by the shopper can produce a matching pair\n// (the signature cannot be forged without the signing key), so no session is needed and nothing else\n// about the order can be read. A wrong pair is indistinguishable from an unknown order.\nconst SIGNATURE_RE = /^[A-Za-z0-9_-]{20,200}$/;\n// POST (not GET) so the signature travels in the body and never lands in request logs or proxies.\nrouter.post('/mandates/public', (req, res, next) => {\n  try {\n    const { orderId, signature } = (req.body ?? {}) as { orderId?: unknown; signature?: unknown };\n    const order =\n      typeof orderId === 'string' && typeof signature === 'string' && SIGNATURE_RE.test(signature)\n        ? orderService.getById(orderId)\n        : undefined;\n    if (!order) throw new AppError(404, 'Mandate not found');\n    const signed = signCartMandate(order);\n    const a = Buffer.from(signed.signature);\n    const b = Buffer.from(signature as string);\n    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new AppError(404, 'Mandate not found');\n    res.set('Cache-Control', 'no-store');\n    res.json({ signed, verification: verifyCartMandate(signed, (id) => orderService.getById(id)) });\n  } catch (err) {\n    next(mapConfigError(err));\n  }\n});\n\n// Public keys (active + previous)."
 },
 {
  "file": "source/apps/backend/public/app.js",
  "name": "QR block in receipt",
  "done": "function qrBlock",
  "old": "    wrap.appendChild(btn); wrap.appendChild(out);\n    return wrap;\n  }",
  "new": "    wrap.appendChild(btn); wrap.appendChild(out);\n    wrap.appendChild(qrBlock(orderId));\n    return wrap;\n  }\n  // Receipt QR: scans to a public page that checks the signed Cart Mandate (/verify.html#<orderId>.<signature>).\n  // The fragment is never sent to a server log; the signature in it is what authorises the read-only check.\n  function verifyLink(orderId, signature) { return location.origin + '/verify.html#' + orderId + '.' + signature; }\n  function qrBlock(orderId) {\n    var box = el('div', 'qr'); box.hidden = true;\n    try {\n      if (typeof qrcode !== 'function') return box;\n      api('/api/orders/' + encodeURIComponent(orderId) + '/mandate').then(function (m) {\n        if (!m || typeof m.signature !== 'string') return;\n        var link = verifyLink(orderId, m.signature);\n        var q = qrcode(0, 'M'); q.addData(link); q.make();\n        var img = document.createElement('img');\n        img.src = q.createDataURL(4, 4); img.alt = i18nT('qr.alt'); img.width = img.height = q.getModuleCount() * 4 + 8;\n        box.appendChild(img);\n        box.appendChild(el('div', 'mut', i18nT('qr.hint')));\n        var a = el('a', 'rlink', i18nT('qr.open')); a.href = link; a.setAttribute('rel', 'noopener'); a.setAttribute('target', '_blank');\n        box.appendChild(a);\n        box.hidden = false;\n      }).catch(function () { /* the QR is an extra; the receipt stays complete without it */ });\n    } catch (e) { /* same */ }\n    return box;\n  }"
 },
 {
  "file": "source/apps/backend/public/i18n.js",
  "name": "QR strings (en)",
  "done": "'qr.alt': 'QR code",
  "old": "      'who.cannot': 'The AI cannot authorize or move money',\n",
  "new": "      'who.cannot': 'The AI cannot authorize or move money',\n      'qr.alt': 'QR code that opens the signed Cart Mandate check',\n      'qr.hint': 'Scan to verify this order’s signed Cart Mandate',\n      'qr.open': 'Open verification page',\n"
 },
 {
  "file": "source/apps/backend/public/i18n.js",
  "name": "QR strings (tr)",
  "done": "'qr.alt': 'İmzalı",
  "old": "      'who.cannot': 'Yapay zeka ödeme yetkisi veremez, para hareket ettiremez',\n",
  "new": "      'who.cannot': 'Yapay zeka ödeme yetkisi veremez, para hareket ettiremez',\n      'qr.alt': 'İmzalı Cart Mandate doğrulamasını açan QR kod',\n      'qr.hint': 'Bu siparişin imzalı Cart Mandate kaydını doğrulamak için tara',\n      'qr.open': 'Doğrulama sayfasını aç',\n"
 },
 {
  "file": "source/apps/backend/public/index.html",
  "name": "qr.js script tag",
  "done": "/qr.js",
  "old": "<script src=\"/i18n.js\" defer></script>",
  "new": "<script src=\"/i18n.js\" defer></script>\n<script src=\"/qr.js\" defer></script>"
 },
 {
  "file": "source/apps/backend/public/index.html",
  "name": "QR css",
  "done": ".qr{",
  "old": ".mandate{margin-top:10px;",
  "new": ".qr{margin-top:10px;text-align:center}.qr img{background:#fff;border-radius:8px;max-width:100%;height:auto;image-rendering:pixelated}.mandate{margin-top:10px;"
 },
 {
  "file": "source/apps/flutter_app/pubspec.yaml",
  "name": "qr_flutter dependency",
  "done": "qr_flutter:",
  "old": "  speech_to_text: ^7.0.0",
  "new": "  speech_to_text: ^7.0.0\n  # Receipt QR code (renders the Cart Mandate verification link). Pure Dart/Flutter.\n  qr_flutter: ^4.1.0"
 },
 {
  "file": "source/apps/flutter_app/lib/services/api_service.dart",
  "name": "paid_receipt import",
  "done": "models/paid_receipt.dart",
  "old": "import 'package:flutter_app/models/order.dart';\n",
  "new": "import 'package:flutter_app/models/order.dart';\nimport 'package:flutter_app/models/paid_receipt.dart';\n"
 },
 {
  "file": "source/apps/flutter_app/lib/services/api_service.dart",
  "name": "publicBaseUrl getter",
  "done": "get publicBaseUrl",
  "old": "  Uri _url(String path) => Uri.parse('$_baseUrl$path');\n",
  "new": "  Uri _url(String path) => Uri.parse('$_baseUrl$path');\n\n  /// Base URL used to build links that are opened outside the app (receipt QR).\n  String get publicBaseUrl => _baseUrl;\n"
 },
 {
  "file": "source/apps/flutter_app/lib/services/api_service.dart",
  "name": "getMandate",
  "done": "Future<MandateSummary?> getMandate",
  "old": "  void _ensureOk(http.Response res, String op) {",
  "new": "  /// The shopper's own signed Cart Mandate for an order (`GET /api/orders/:id/mandate`).\n  /// Returns `null` when the payload is not what the receipt expects; the\n  /// receipt then simply has no QR code.\n  Future<MandateSummary?> getMandate(String orderId) async {\n    final res = await _executeWithAuth(\n      (headers) =>\n          _client.get(_url('/api/orders/$orderId/mandate'), headers: headers),\n    );\n    _ensureOk(res, 'getMandate');\n    return MandateSummary.tryParse(jsonDecode(res.body));\n  }\n\n  void _ensureOk(http.Response res, String op) {"
 },
 {
  "file": "source/apps/flutter_app/lib/l10n/app_strings.dart",
  "name": "receipt strings (en)",
  "done": "'receipt.title': 'Receipt'",
  "old": "      'why.title': 'Why these items?',",
  "new": "      'receipt.title': 'Receipt',\n      'receipt.status': 'Status',\n      'receipt.total': 'Total',\n      'receipt.captureId': 'Capture ID',\n      'receipt.close': 'Close receipt',\n      'receipt.qrAlt': 'QR code that opens the signed Cart Mandate check',\n      'receipt.qrHint': 'Scan to verify this order\\u2019s signed Cart Mandate',\n      'receipt.copyLink': 'Copy verification link',\n      'receipt.linkCopied': 'Link copied',\n      'who.title': 'Who did what',\n      'who.ai': 'Coco (AI) prepared the cart',\n      'who.rule': 'Rule-based planner (no AI) prepared the cart',\n      'who.you': 'You approved and paid on PayPal',\n      'who.cannot': 'The AI cannot authorize or move money',\n      'why.title': 'Why these items?',"
 },
 {
  "file": "source/apps/flutter_app/lib/l10n/app_strings.dart",
  "name": "receipt strings (tr)",
  "done": "'receipt.title': 'Makbuz'",
  "old": "      'why.title': 'Bu ürünler neden?',",
  "new": "      'receipt.title': 'Makbuz',\n      'receipt.status': 'Durum',\n      'receipt.total': 'Toplam',\n      'receipt.captureId': 'Tahsilat no',\n      'receipt.close': 'Makbuzu kapat',\n      'receipt.qrAlt': 'İmzalı Cart Mandate doğrulamasını açan QR kod',\n      'receipt.qrHint': 'Bu siparişin imzalı Cart Mandate kaydını doğrulamak için tara',\n      'receipt.copyLink': 'Doğrulama bağlantısını kopyala',\n      'receipt.linkCopied': 'Bağlantı kopyalandı',\n      'who.title': 'Kim ne yaptı',\n      'who.ai': 'Coco (yapay zeka) sepeti hazırladı',\n      'who.rule': 'Kural tabanlı planlayıcı (yapay zeka yok) sepeti hazırladı',\n      'who.you': 'Ödemeyi sen PayPal\\u2019da onayladın',\n      'who.cannot': 'Yapay zeka ödeme yetkisi veremez, para hareket ettiremez',\n      'why.title': 'Bu ürünler neden?',"
 },
 {
  "file": "source/apps/flutter_app/lib/screens/chat_screen.dart",
  "name": "imports",
  "done": "markdown_tables.dart",
  "old": "import 'package:flutter_app/services/voice_controller.dart';\n",
  "new": "import 'package:flutter_app/services/voice_controller.dart';\nimport 'package:flutter_app/utils/markdown_tables.dart';\nimport 'package:flutter_app/widgets/receipt_section.dart';\n"
 },
 {
  "file": "source/apps/flutter_app/lib/screens/chat_screen.dart",
  "name": "markdown tables as cards",
  "done": "_tableCards(",
  "old": "  @override\n  Widget build(BuildContext context) {\n    final linkColor = Theme.of(context).colorScheme.primary;\n    final normalized = text.replaceAll('\\r\\n', '\\n').replaceAll('\\r', '\\n');\n    final withBullets = normalized.replaceAllMapped(_bulletRe, (m) => '${m.group(1)}• ');\n    return Text.rich(TextSpan(style: style, children: _spans(withBullets, linkColor)));\n  }\n}\n",
  "new": "  Widget _textBlock(String src, Color linkColor) {\n    final normalized = src.replaceAll('\\r\\n', '\\n').replaceAll('\\r', '\\n');\n    final withBullets = normalized.replaceAllMapped(_bulletRe, (m) => '${m.group(1)}• ');\n    return Text.rich(TextSpan(style: style, children: _spans(withBullets, linkColor)));\n  }\n\n  /// A Markdown table drawn as cards: one rounded card per row, first column as\n  /// the title, the other columns as label/value pairs (parity with the web).\n  Widget _tableCards(BuildContext context, MdBlock block, Color linkColor) {\n    final scheme = Theme.of(context).colorScheme;\n    final header = block.header!;\n    return Column(\n      crossAxisAlignment: CrossAxisAlignment.stretch,\n      children: [\n        for (final cells in block.rows!)\n          Container(\n            margin: const EdgeInsets.symmetric(vertical: 4),\n            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),\n            decoration: BoxDecoration(\n              color: scheme.surface,\n              borderRadius: BorderRadius.circular(14),\n              border: Border.all(color: scheme.outlineVariant),\n            ),\n            child: Column(\n              crossAxisAlignment: CrossAxisAlignment.start,\n              children: [\n                Text.rich(\n                  TextSpan(\n                    style: (style ?? const TextStyle()).copyWith(\n                      fontWeight: FontWeight.w700,\n                    ),\n                    children: _spans(cells.isEmpty ? '' : cells.first, linkColor),\n                  ),\n                ),\n                for (var k = 1; k < cells.length; k++)\n                  if (cells[k].isNotEmpty)\n                    Padding(\n                      padding: const EdgeInsets.only(top: 3),\n                      child: Row(\n                        crossAxisAlignment: CrossAxisAlignment.start,\n                        mainAxisAlignment: MainAxisAlignment.spaceBetween,\n                        children: [\n                          Text(\n                            k < header.length ? header[k] : '',\n                            style: TextStyle(\n                              fontSize: 12,\n                              color: scheme.onSurfaceVariant,\n                            ),\n                          ),\n                          const SizedBox(width: 12),\n                          Flexible(\n                            child: Text.rich(\n                              TextSpan(\n                                style: style,\n                                children: _spans(cells[k], linkColor),\n                              ),\n                              textAlign: TextAlign.right,\n                            ),\n                          ),\n                        ],\n                      ),\n                    ),\n              ],\n            ),\n          ),\n      ],\n    );\n  }\n\n  @override\n  Widget build(BuildContext context) {\n    final linkColor = Theme.of(context).colorScheme.primary;\n    final blocks = splitMarkdownBlocks(text);\n    // No table: exactly the previous single-Text rendering.\n    if (!blocks.any((b) => b.isTable)) return _textBlock(text, linkColor);\n    return Column(\n      crossAxisAlignment: CrossAxisAlignment.start,\n      mainAxisSize: MainAxisSize.min,\n      children: [\n        for (final b in blocks)\n          if (b.isTable)\n            _tableCards(context, b, linkColor)\n          else\n            Padding(\n              padding: const EdgeInsets.symmetric(vertical: 2),\n              child: _textBlock(b.text!, linkColor),\n            ),\n      ],\n    );\n  }\n}\n"
 },
 {
  "file": "source/apps/flutter_app/lib/screens/chat_screen.dart",
  "name": "receipt section",
  "done": "const ReceiptSection()",
  "old": "          _inputRow(),\n",
  "new": "          const ReceiptSection(),\n          _inputRow(),\n"
 },
 {
  "file": "openapi.json",
  "name": "/api/mandates/public",
  "done": "\"/api/mandates/public\"",
  "old": "    \"/api/mandates/verify\": {",
  "new": "    \"/api/mandates/public\": {\n      \"post\": {\n        \"tags\": [\n          \"Mandates\"\n        ],\n        \"summary\": \"Verify a mandate from a receipt share link (no session needed)\",\n        \"security\": [],\n        \"description\": \"The receipt QR code opens /verify.html#<orderId>.<signature>. The page posts those two values here. The Ed25519 signature of the order’s mandate is the capability: only someone who was handed the link can produce a matching pair, and a wrong pair is indistinguishable from an unknown order (404). The signature is sent in the body so it never appears in a request log.\",\n        \"requestBody\": {\n          \"required\": true,\n          \"content\": {\n            \"application/json\": {\n              \"schema\": {\n                \"type\": \"object\",\n                \"required\": [\n                  \"orderId\",\n                  \"signature\"\n                ],\n                \"properties\": {\n                  \"orderId\": {\n                    \"type\": \"string\"\n                  },\n                  \"signature\": {\n                    \"type\": \"string\"\n                  }\n                }\n              }\n            }\n          }\n        },\n        \"responses\": {\n          \"200\": {\n            \"description\": \"Signed mandate plus verification result\",\n            \"content\": {\n              \"application/json\": {\n                \"schema\": {\n                  \"type\": \"object\",\n                  \"properties\": {\n                    \"signed\": {\n                      \"$ref\": \"#/components/schemas/SignedCartMandate\"\n                    },\n                    \"verification\": {\n                      \"$ref\": \"#/components/schemas/MandateVerification\"\n                    }\n                  }\n                }\n              }\n            }\n          },\n          \"404\": {\n            \"description\": \"Unknown order or signature mismatch\",\n            \"content\": {\n              \"application/json\": {\n                \"schema\": {\n                  \"$ref\": \"#/components/schemas/Error\"\n                }\n              }\n            }\n          },\n          \"503\": {\n            \"description\": \"Mandate key configuration is invalid\",\n            \"content\": {\n              \"application/json\": {\n                \"schema\": {\n                  \"$ref\": \"#/components/schemas/Error\"\n                }\n              }\n            }\n          }\n        }\n      }\n    },\n    \"/api/mandates/verify\": {"
 }
];
let problems = 0, applied = 0, skipped = 0;
const byFile = new Map();
for (const e of EDITS) { if (!byFile.has(e.file)) byFile.set(e.file, []); byFile.get(e.file).push(e); }
for (const [file, edits] of byFile) {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) { console.log('MISSING FILE  ' + file); problems++; continue; }
  const raw = fs.readFileSync(p, 'utf8');
  const crlf = raw.includes('\r\n');
  let c = raw.replace(/\r\n/g, '\n');
  let touched = false, bad = false;
  for (const e of edits) {
    if (c.includes(e.done)) { console.log('already there ' + file + '  [' + e.name + ']'); skipped++; continue; }
    const first = c.indexOf(e.old);
    if (first < 0 || c.indexOf(e.old, first + 1) >= 0) {
      console.log('ANCHOR PROBLEM ' + file + '  [' + e.name + ']  (' + (first < 0 ? 'not found' : 'not unique') + ')');
      problems++; bad = true; continue;
    }
    c = c.slice(0, first) + e.new + c.slice(first + e.old.length);
    touched = true; applied++;
    console.log('patched       ' + file + '  [' + e.name + ']');
  }
  if (touched && !bad) fs.writeFileSync(p, crlf ? c.replace(/\n/g, '\r\n') : c);
  else if (touched && bad) console.log('NOT WRITTEN   ' + file + ' (fix the anchor problem above, then re-run)');
}
console.log('\n' + applied + ' applied, ' + skipped + ' already present, ' + problems + ' problem(s).');
process.exit(problems ? 1 : 0);
