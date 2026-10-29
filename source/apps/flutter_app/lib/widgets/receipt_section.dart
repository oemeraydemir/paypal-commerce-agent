import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'package:flutter_app/providers/checkout_provider.dart';
import 'package:flutter_app/providers/locale_provider.dart';
import 'package:flutter_app/providers/receipt_controller.dart';
import 'package:flutter_app/widgets/paid_receipt_card.dart';

/// Drop-in section for the chat screen: shows the receipt after a confirmed
/// payment. Owns its [ReceiptController], so the checkout code stays untouched.
class ReceiptSection extends StatefulWidget {
  const ReceiptSection({super.key});

  @override
  State<ReceiptSection> createState() => _ReceiptSectionState();
}

class _ReceiptSectionState extends State<ReceiptSection> {
  ReceiptController? _controller;
  CheckoutProvider? _checkout;
  Map<String, String> _names = const <String, String>{};
  bool _namesRequested = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final checkout = Provider.of<CheckoutProvider>(context, listen: false);
    if (!identical(checkout, _checkout)) {
      _controller?.dispose();
      _checkout = checkout;
      _controller = ReceiptController(checkout);
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  /// Product names for lines the chat never named (hand-built carts).
  void _loadNamesOnce() {
    if (_namesRequested || _checkout == null) return;
    _namesRequested = true;
    unawaited(
      Future<void>(() async {
        try {
          final products = await _checkout!.api.getCatalog();
          if (!mounted) return;
          setState(() => _names = {for (final p in products) p.id: p.name});
        } catch (_) {
          // Names are cosmetic; the product id is shown instead.
        }
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    if (controller == null) return const SizedBox.shrink();
    return ListenableBuilder(
      listenable: controller,
      builder: (ctx, _) {
        final receipt = controller.receipt;
        if (receipt == null) return const SizedBox.shrink();
        if (receipt.lines.any((l) => l.name == null || l.name!.isEmpty)) {
          _loadNamesOnce();
        }
        return ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(ctx).size.height * 0.5,
          ),
          child: SingleChildScrollView(
            child: PaidReceiptCard(
              receipt: receipt,
              lang: Provider.of<LocaleProvider>(ctx).languageCode,
              catalogNames: _names,
              onClose: controller.dismiss,
            ),
          ),
        );
      },
    );
  }
}
