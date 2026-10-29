import 'package:flutter/foundation.dart';

import 'package:flutter_app/models/paid_receipt.dart';
import 'package:flutter_app/providers/checkout_provider.dart';

/// Exposes the post-payment [PaidReceipt] by *observing* [CheckoutProvider].
///
/// The checkout provider is the single owner of the receipt and the single
/// caller of the server's signed Cart Mandate (prices + QR). This controller
/// simply mirrors the checkout's receipt so a UI can react to it without
/// re-fetching the mandate. It deliberately does not touch the checkout state
/// machine.
class ReceiptController extends ChangeNotifier {
  ReceiptController(this.checkout) {
    checkout.addListener(_onCheckout);
    _onCheckout();
  }

  final CheckoutProvider checkout;

  PaidReceipt? _receipt;
  PaidReceipt? get receipt => _receipt;

  bool _disposed = false;

  /// Order for which the receipt was dismissed, so it is not resurrected by a
  /// later notification for the same order.
  String? _dismissedOrderId;

  void dismiss() {
    if (_receipt == null) return;
    _dismissedOrderId = _receipt!.orderId;
    _receipt = null;
    notifyListeners();
  }

  void _onCheckout() {
    if (_disposed) return;
    final receipt = checkout.receipt;
    if (receipt == null) {
      // A new checkout (or a reset) starts: the previous receipt is done.
      _dismissedOrderId = null;
      if (_receipt != null) {
        _receipt = null;
        notifyListeners();
      }
      return;
    }
    if (receipt.orderId == _dismissedOrderId) return;
    if (!identical(receipt, _receipt)) {
      _receipt = receipt;
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _disposed = true;
    try {
      checkout.removeListener(_onCheckout);
    } catch (_) {
      // The checkout provider may already be disposed.
    }
    super.dispose();
  }
}
