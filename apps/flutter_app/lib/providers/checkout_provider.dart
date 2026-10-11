import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

import 'package:flutter_app/models/cart.dart';
import 'package:flutter_app/models/order.dart';
import 'package:flutter_app/providers/chat_provider.dart';
import 'package:flutter_app/services/api_service.dart';

/// Drives the PayPal checkout flow and a manual product cart.
///
/// Flow (matches the backend's two-step PayPal Orders API):
///   1. [startCheckout]  -> `POST /api/orders/create` -> opens [approvalUrl] in
///      the system browser.
///   2. User approves on PayPal, returns to the app.
///   3. [completeCheckout] -> `POST /api/orders/:id/capture`.
///
/// The client never sees PayPal credentials or calls the PayPal SDK directly;
/// every payment action is server-side. The manual cart and the AI-prepared
/// cart are unified into a single list of [OrderItem]s at checkout time.
class CheckoutProvider extends ChangeNotifier {
  final ApiService api;
  final ChatProvider chat;
  final Future<bool> Function(Uri url) _launchApproval;
  PreparedCart? _observedPreparedCart;

  CheckoutProvider(
    this.api,
    this.chat, {
    Future<bool> Function(Uri url)? launchApproval,
  }) : _launchApproval =
           launchApproval ??
           ((url) => launchUrl(url, mode: LaunchMode.externalApplication)) {
    _observedPreparedCart = chat.lastPreparedCart;
    chat.addListener(_onChatChanged);
  }

  void _onChatChanged() {
    if (identical(_observedPreparedCart, chat.lastPreparedCart)) return;
    _observedPreparedCart = chat.lastPreparedCart;
    _quantityOverrides.clear();
    notifyListeners();
  }

  @override
  void dispose() {
    chat.removeListener(_onChatChanged);
    super.dispose();
  }

  /// Manual additions are merged with the AI-prepared cart, never substituted.
  final Map<String, int> _manualCart = <String, int>{};
  final Map<String, int> _quantityOverrides = <String, int>{};
  Map<String, int> get cart => Map.unmodifiable(_resolvedQuantities());

  bool _busy = false;
  bool get busy => _busy;

  String? _error;
  String? get error => _error;

  String? _statusMessage;
  String? get statusMessage => _statusMessage;

  OrderCreateResult? _created;
  OrderCreateResult? get created => _created;
  bool get hasPendingOrder => _created != null && _captured == null;

  OrderCaptureResult? _captured;
  OrderCaptureResult? get captured => _captured;

  bool _paypalApproved = false;
  bool get paypalApproved => _paypalApproved;

  /// Stable per-checkout-attempt idempotency key sent as `Idempotency-Key` (F4).
  /// One key per logical attempt; reused across transport retries, regenerated
  /// for the next attempt.
  String? _idempotencyKey;

  String _newIdempotencyKey() {
    final rand = Random();
    final entropy = List<int>.generate(
      8,
      (_) => rand.nextInt(256),
    ).map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return 'co-${DateTime.now().microsecondsSinceEpoch.toRadixString(36)}-$entropy';
  }

  void setError(String message) {
    _error = message;
    notifyListeners();
  }

  Map<String, int> _resolvedQuantities() {
    final quantities = <String, int>{};
    for (final line in chat.lastPreparedCart?.items ?? const []) {
      quantities[line.productId] = line.quantity;
    }
    for (final entry in _manualCart.entries) {
      quantities.update(
        entry.key,
        (quantity) => quantity + entry.value,
        ifAbsent: () => entry.value,
      );
    }
    for (final entry in _quantityOverrides.entries) {
      if (entry.value <= 0) {
        quantities.remove(entry.key);
      } else {
        quantities[entry.key] = entry.value;
      }
    }
    return quantities;
  }

  void addProduct(String productId, {int qty = 1}) {
    if (qty <= 0) {
      throw ArgumentError.value(qty, 'qty', 'Must be greater than zero');
    }
    final aiQuantity =
        chat.lastPreparedCart?.items
            .where((line) => line.productId == productId)
            .fold<int>(0, (sum, line) => sum + line.quantity) ??
        0;
    if (aiQuantity > 0) {
      _quantityOverrides[productId] = (cart[productId] ?? 0) + qty;
    } else {
      _manualCart[productId] = (_manualCart[productId] ?? 0) + qty;
    }
    notifyListeners();
  }

  void setQuantity(String productId, int qty) {
    final isAiPrepared = chat.lastPreparedCart?.items.any(
      (line) => line.productId == productId,
    );
    if (isAiPrepared ?? false) {
      _quantityOverrides[productId] = qty;
    } else if (qty <= 0) {
      _manualCart.remove(productId);
    } else {
      _manualCart[productId] = qty;
    }
    notifyListeners();
  }

  void removeProduct(String productId) {
    setQuantity(productId, 0);
  }

  Future<void> clear() async {
    if (_busy) return;
    if (hasPendingOrder) {
      _error = 'Finish or cancel the PayPal order before clearing your cart.';
      notifyListeners();
      return;
    }
    _busy = true;
    _error = null;
    notifyListeners();
    try {
      if (chat.lastPreparedCart != null) {
        await chat.clearPreparedCart();
      }
    } catch (error) {
      _busy = false;
      _error = error.toString();
      notifyListeners();
      return;
    }

    _manualCart.clear();
    _quantityOverrides.clear();
    _created = null;
    _captured = null;
    _paypalApproved = false;
    _statusMessage = null;
    _error = null;
    _busy = false;
    notifyListeners();
  }

  List<OrderItem> _resolveItems() {
    final items = cart.entries
        .map((entry) => OrderItem(id: entry.key, quantity: entry.value))
        .toList();
    items.sort((a, b) => a.id.compareTo(b.id));
    return items;
  }

  bool get canCheckout => cart.isNotEmpty;

  /// Accept only a PayPal return link for the order currently awaiting approval.
  ///
  /// On a valid cancellation return, the cancellation is now propagated to the
  /// backend (`POST /api/orders/:orderId/cancel`) so the server releases the
  /// daily-spend reservation; the local cart is preserved and the pending order
  /// is only cleared once the backend confirms (F2). Stale or unrelated deep
  /// links are not acted on and the local state is left recoverable.
  Future<bool> handlePayPalReturn(Uri uri) async {
    if (uri.scheme != 'paypalcommerceagent' || uri.host != 'checkout') {
      return false;
    }
    final token = uri.queryParameters['token'];
    if (_created == null) {
      // Nothing pending locally; ignore a return link with no matching order.
      _statusMessage = 'No pending order to handle.';
      notifyListeners();
      return true;
    }
    if (token != _created!.paypalOrderId) {
      _error = 'This PayPal return link does not match the pending order.';
      notifyListeners();
      // Not handled: the UI surfaces a "does not match your pending order"
      // message and no backend call is made (F2).
      return false;
    }
    if (uri.path == '/cancel') {
      await _cancelViaBackend();
      return true;
    }
    if (uri.path != '/success') return false;

    _paypalApproved = true;
    _statusMessage = 'PayPal approved your order. Confirm to capture payment.';
    _error = null;
    notifyListeners();
    return true;
  }

  /// Propagates a PayPal cancellation to the backend. The local cart is kept and
  /// the pending order is only cleared when the server confirms the cancel; on
  /// failure the recoverable pending order is preserved and the error is shown
  /// (F2/F3). This never marks the order as paid.
  Future<void> _cancelViaBackend() async {
    final orderId = _created!.orderId;
    _busy = true;
    _error = null;
    notifyListeners();
    try {
      await api.cancelOrder(orderId);
      // Backend confirmed: safe to drop the pending order. Cart is preserved.
      _created = null;
      _paypalApproved = false;
      _statusMessage =
          'Payment was cancelled in PayPal. Your cart is unchanged.';
    } on ApiException catch (e) {
      // Keep the recoverable pending order so the user can retry; surface error.
      _error = 'Cancel failed (${e.statusCode}): ${e.message}';
      _statusMessage = null;
    } catch (e) {
      _error = e.toString();
      _statusMessage = null;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  /// Explains that the matching PayPal return link is required before capture.
  /// A user assertion from the browser cannot authorize payment.
  void confirmApprovalInBrowser() {
    _statusMessage =
        'Approval is not confirmed in AI Café yet. Return using PayPal’s link so this order can be validated.';
    _error = null;
    notifyListeners();
  }

  /// Step 1+2: create the order server-side and open the PayPal approval URL.
  Future<void> startCheckout() async {
    if (_busy) return;
    if (hasPendingOrder) {
      _error = 'Finish or cancel the existing PayPal order before starting another checkout.';
      notifyListeners();
      return;
    }
    final items = _resolveItems();
    if (items.isEmpty) {
      _error = 'Your cart is empty.';
      notifyListeners();
      return;
    }

    _busy = true;
    _error = null;
    _captured = null;
    _created = null;
    _paypalApproved = false;
    _statusMessage = 'Creating PayPal order…';
    notifyListeners();

    try {
      // One stable key per logical checkout attempt (F4). It is reused if the
      // request is transparently retried (e.g. on a 401 session refresh inside
      // ApiService) and regenerated on the next startCheckout call.
      _idempotencyKey = _newIdempotencyKey();
      final result = await api.createOrder(
        items: items,
        idempotencyKey: _idempotencyKey,
      );
      final approvalUrl = result.approvalUrl;
      final approvalUri = approvalUrl == null
          ? null
          : Uri.tryParse(approvalUrl);
      if (approvalUri == null || approvalUri.scheme != 'https') {
        throw StateError('PayPal did not return a secure approval link.');
      }
      _created = result;
      _statusMessage = 'Order created. Opening PayPal for approval…';
      notifyListeners();

      final launched = await _launchApproval(approvalUri);
      _statusMessage = launched
          ? 'Approve the payment in PayPal. You will return here to confirm capture.'
          : 'Could not open PayPal. Use the retry or manual return options.';
      if (!launched) _error = 'Could not open the PayPal approval page.';
    } on ApiException catch (e) {
      _error = 'Checkout failed (${e.statusCode}): ${e.message}';
      _statusMessage = null;
    } catch (e) {
      _error = e.toString();
      _statusMessage = null;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  Future<void> reopenApprovalPage() async {
    final approvalUrl = _created?.approvalUrl;
    final approvalUri = approvalUrl == null ? null : Uri.tryParse(approvalUrl);
    if (approvalUri == null || approvalUri.scheme != 'https') {
      setError('No secure PayPal approval link is available for this order.');
      return;
    }

    _busy = true;
    _error = null;
    notifyListeners();
    try {
      final launched = await _launchApproval(approvalUri);
      if (!launched) {
        _error = 'Could not open the PayPal approval page.';
      } else {
        _statusMessage = 'Approve the order in PayPal, then return to AI Café.';
      }
    } catch (error) {
      _error = 'Could not open PayPal: $error';
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  /// Step 3: capture the approved PayPal order.
  Future<void> completeCheckout() async {
    if (_busy) return;
    if (_created == null) {
      _error = 'No pending order to capture.';
      notifyListeners();
      return;
    }
    if (!_paypalApproved) {
      _error = 'Approve the order in PayPal before capturing payment.';
      notifyListeners();
      return;
    }

    _busy = true;
    _error = null;
    _statusMessage = 'Capturing payment…';
    notifyListeners();

    try {
      final result = await api.captureOrder(_created!.orderId);
      if (result.status == 'PAID') {
        _captured = result;
        _statusMessage =
            'Payment captured! Status: ${result.status}'
            '${result.paypalCaptureId != 'unknown' ? ' (capture ${result.paypalCaptureId})' : ''}';
        _manualCart.clear();
        _quantityOverrides.clear();
        if (chat.lastPreparedCart != null) {
          try {
            await chat.clearPreparedCart();
          } catch (error) {
            _error =
                'Payment captured, but the AI cart could not be cleared: $error';
          }
        }
      } else if (result.status == 'PAYMENT_PENDING') {
        _statusMessage = 'PayPal has not confirmed the payment yet. Check its status again before starting another order.';
      } else {
        _created = null;
        _paypalApproved = false;
        _statusMessage = null;
        _error = 'PayPal did not complete the payment. Your cart is unchanged; review checkout to try again.';
      }
    } on ApiException catch (e) {
      // F3: recover from stale/ambiguous pending orders without losing state.
      final msg = e.message.toLowerCase();
      if (e.statusCode == 409 && msg.contains('already captured')) {
        // Definitive: the order is already paid. Reflect that and clear the
        // pending state. We do not invent a capture id, and this is NOT treated
        // as a cancellation.
        _captured = OrderCaptureResult(
          orderId: _created!.orderId,
          status: 'PAID',
          paypalCaptureId: 'unknown',
          paypalStatus: 'COMPLETED',
        );
        _created = null;
        _paypalApproved = false;
        _statusMessage = 'Payment was already completed for this order.';
      } else if (e.statusCode == 502 || e.statusCode == 409) {
        // Ambiguous transport / capture-in-progress: preserve the recoverable
        // pending order and let the user retry.
        _error =
            'Capture could not be confirmed (${e.statusCode}): ${e.message}';
        _statusMessage = null;
      } else {
        _error = 'Capture failed (${e.statusCode}): ${e.message}';
        _statusMessage = null;
      }
    } catch (e) {
      _error = e.toString();
      _statusMessage = null;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  /// Cancels the current pending PayPal order via the backend
  /// (`POST /api/orders/:orderId/cancel`). The server enforces ownership and
  /// refuses to cancel already-captured orders, so this is payment-safe. The
  /// cart is intentionally preserved so the shopper can retry.
  Future<void> cancelCheckout([String? orderId]) async {
    if (_busy) return;
    final target = orderId ?? _created?.orderId;
    if (target == null) {
      _error = 'No pending order to cancel.';
      notifyListeners();
      return;
    }
    _busy = true;
    _error = null;
    notifyListeners();
    try {
      final result = await api.cancelOrder(target);
      _created = null;
      _paypalApproved = false;
      _statusMessage = 'Order cancelled (status: ${result.status}).';
    } on ApiException catch (e) {
      // F3: do not treat every error as an ordinary cancellation. Preserve
      // recoverable state and classify specific outcomes.
      final msg = e.message.toLowerCase();
      if (e.statusCode == 409 && msg.contains('already captured')) {
        // The order is actually paid; reflect that instead of leaving a stale
        // pending order. Not marked cancelled.
        _captured = OrderCaptureResult(
          orderId: target,
          status: 'PAID',
          paypalCaptureId: 'unknown',
          paypalStatus: 'COMPLETED',
        );
        _created = null;
        _paypalApproved = false;
        _statusMessage = 'This order was already paid.';
      } else if (e.statusCode == 404) {
        // Order no longer exists on the server: safe to drop the local pending
        // reference (nothing to cancel).
        _created = null;
        _paypalApproved = false;
        _statusMessage = 'The order no longer exists; nothing to cancel.';
      } else {
        // 502 (could not verify PayPal state) or other: keep the recoverable
        // pending order so the user can retry.
        _error = 'Cancel failed (${e.statusCode}): ${e.message}';
        _statusMessage = null;
      }
    } catch (e) {
      _error = e.toString();
      _statusMessage = null;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }
}
