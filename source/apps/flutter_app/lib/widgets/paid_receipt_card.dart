import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';

import 'package:flutter_app/l10n/app_strings.dart';
import 'package:flutter_app/models/paid_receipt.dart';

/// Receipt shown after a confirmed payment: what was bought, who did what
/// (AI prepared, the human paid, the AI cannot move money) and a QR code that
/// opens the public check of the signed Cart Mandate.
///
/// The AI row appears only when an assistant really prepared the cart.
class PaidReceiptCard extends StatelessWidget {
  final PaidReceipt receipt;
  final String lang;

  /// Fallback product names (catalog) for lines the chat did not name.
  final Map<String, String> catalogNames;
  final VoidCallback? onClose;

  /// Optional Dispute Evidence Package section (Order-to-Resolution Passport).
  /// The parent owns it so the receipt card stays free of network access.
  final Widget? evidenceSection;

  const PaidReceiptCard({
    super.key,
    required this.receipt,
    required this.lang,
    this.catalogNames = const <String, String>{},
    this.onClose,
    this.evidenceSection,
  });

  String _s(String key) => AppStrings.get(lang, key);

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final d = receipt.paidAt;
    String two(int n) => n.toString().padLeft(2, '0');
    // Plain formatting on purpose: no locale tables to initialise, same result everywhere.
    final dateText =
        '${two(d.day)}.${two(d.month)}.${d.year} ${two(d.hour)}:${two(d.minute)}';
    final totalText = receipt.totalFormatted.isNotEmpty
        ? receipt.totalFormatted
        : (receipt.totalMinor == null
              ? ''
              : AppStrings.formatMoney(lang, receipt.totalMinor!, receipt.currency));

    return Card(
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.check_circle, color: scheme.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _s('receipt.title'),
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                if (onClose != null)
                  IconButton(
                    tooltip: _s('receipt.close'),
                    icon: const Icon(Icons.close),
                    onPressed: onClose,
                  ),
              ],
            ),
            Text(
              '${_s('receipt.status')}: PAID · $dateText',
              style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
            ),
            const SizedBox(height: 8),
            for (final line in receipt.lines) _lineRow(line, scheme),
            const Divider(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  _s('receipt.total'),
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                Text(
                  totalText,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ],
            ),
            if (receipt.captureId != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  '${_s('receipt.captureId')}: ${maskCaptureId(receipt.captureId!)}',
                  style: TextStyle(
                    color: scheme.onSurfaceVariant,
                    fontSize: 12,
                  ),
                ),
              ),
            const SizedBox(height: 10),
            _whoBlock(scheme),
            if (receipt.verifyLink != null) ...[
              const SizedBox(height: 12),
              _qrBlock(context, scheme),
            ],
            if (evidenceSection != null) ...[
              const SizedBox(height: 10),
              evidenceSection!,
            ],
          ],
        ),
      ),
    );
  }

  Widget _lineRow(ReceiptLine line, ColorScheme scheme) {
    final name = (line.name != null && line.name!.isNotEmpty)
        ? line.name!
        : (catalogNames[line.productId] ?? line.productId);
    final price = line.lineTotalMinor == null
        ? ''
        : AppStrings.formatMoney(lang, line.lineTotalMinor!, receipt.currency);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(child: Text('${line.quantity}× $name')),
          Text(price),
        ],
      ),
    );
  }

  Widget _whoBlock(ColorScheme scheme) {
    final rows = <(String, String)>[
      if (receipt.source == ReceiptCartSource.ai) ('🤖', _s('who.ai')),
      if (receipt.source == ReceiptCartSource.ruleBased) ('⚙️', _s('who.rule')),
      ('🧑', _s('who.you')),
      ('🔒', _s('who.cannot')),
    ];
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _s('who.title'),
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 6),
          for (final r in rows)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(width: 26, child: Text(r.$1)),
                  Expanded(child: Text(r.$2)),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _qrBlock(BuildContext context, ColorScheme scheme) {
    final link = receipt.verifyLink!;
    return Center(
      child: Column(
        children: [
          Semantics(
            label: _s('receipt.qrAlt'),
            image: true,
            child: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(8),
              ),
              child: QrImageView(
                data: link,
                size: 180,
                backgroundColor: Colors.white,
                errorCorrectionLevel: QrErrorCorrectLevel.M,
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            _s('receipt.qrHint'),
            textAlign: TextAlign.center,
            style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
          ),
          TextButton.icon(
            icon: const Icon(Icons.copy, size: 16),
            label: Text(_s('receipt.copyLink')),
            onPressed: () async {
              final messenger = ScaffoldMessenger.maybeOf(context);
              await Clipboard.setData(ClipboardData(text: link));
              messenger?.showSnackBar(
                SnackBar(content: Text(_s('receipt.linkCopied'))),
              );
            },
          ),
        ],
      ),
    );
  }
}
