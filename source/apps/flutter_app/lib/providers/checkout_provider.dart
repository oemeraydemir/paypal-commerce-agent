import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

import 'package:flutter_app/l10n/app_strings.dart';
import 'package:flutter_app/models/cart.dart';
import 'package:flutter_app/models/order.dart';
import 'package:flutter_app/providers/chat_provider.dart';
import 'package:flutter_app/providers/locale_provider.dart';
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
/// Server verdict state for the CURRENT cart. Checkout is only allowed for
/// [allowed] and [needsApproval]; everything else (checking, blocked, error,
/// idle) keeps the pay button disabled. The backend re-checks on order creation.
enum CartPolicyStatus { idle, checking, allowed, needsApproval, blocked, error }

class CheckoutProvider extends ChangeNotifier {
  final ApiService api;
  final ChatProvider chat;
  final LocaleProvider? localeProvider;
  final Future<bool> Function(Uri url) _launchApproval;

  String get _languageCode => localeProvider?.languageCode ?? 'en';

  String _localized(String key, [List<String> args = const []]) {
    var value = AppStrings.get(_languageCode, key);
    for (final arg in args) {
      value = value.replaceFirst('%s', arg);
    }
    return value;
  }

  String? _errorKey;
  List<String> _errorArgs = const [];
  String? _rawError;
  String? get error =>
      _errorKey == null ? _rawError : _localized(_errorKey!, _errorArgs);

  String? _statusMessageKey;
  List<String> _statusMessageArgs = const [];
  String? _rawStatusMessage;
  String? get statusMessage => _statusMessageKey == null
      ? _rawStatusMessage
      : _localized(_statusMessageKey!, _statusMessageArgs);
  PreparedCart? _observedPreparedCart;
  bool _disposed = false;

  // Every cart change bumps the version; a response is applied only if it still
  // belongs to the latest version, so a late reply can never override a newer cart.
  int _policyVersion = 0;
  // The in-flight verdict request; never completes with an error (see catchError below).
  Future<void>? _policyFuture;
  CartPolicyStatus _policyStatus = CartPolicyStatus.idle;
  String? _policyReason;
  String? _policyReasonKey;
  CartPolicyStatus get policyStatus => _policyStatus;
  String? get policyReason => _policyReasonKey == null
      ? _policyReason
      : _localized(_policyReasonKey!);

  void _clearPolicyReason() {
    _policyReason = null;
    _policyReasonKey = null;
  }
  bool get policyAllowsCheckout =>
      canCheckout &&
      (_policyStatus == CartPolicyStatus.allowed ||
          _policyStatus == CartPolicyStatus.needsApproval);

  void _refreshPolicy() {
    final version = ++_policyVersion;
    final items = _resolveItems();
    if (items.isEmpty) {
      _policyFuture = null;
      _policyStatus = CartPolicyStatus.idle;
      _clearPolicyReason();
      return;
    }
    _policyStatus = CartPolicyStatus.checking;
    _clearPolicyReason();
    _policyFuture = api
        .previewPolicy(items)
        .then((preview) {
          if (_disposed || version != _policyVersion) return;
          switch (preview.decision) {
            case PolicyDecision.autoAllow:
              _policyStatus = CartPolicyStatus.allowed;
            case PolicyDecision.requireConfirmation:
              _policyStatus = CartPolicyStatus.needsApproval;
            case PolicyDecision.block:
              _policyStatus = CartPolicyStatus.blocked;
            case PolicyDecision.unknown:
              _policyStatus = CartPolicyStatus.error;
          }
          _policyReason = preview.reason;
      _policyReasonKey = null;
          notifyListeners();
        })
        .catchError((Object _) {
          if (_disposed || version != _policyVersion) return;
          _policyStatus = CartPolicyStatus.error;
          _clearPolicyReason();
          _policyReasonKey = 'checkout.errorPolicyUnavailableRetry';
          notifyListeners();
        });
  }

  CheckoutProvider(
    this.api,
    this.chat, {
    this.localeProvider,
    Future<bool> Function(Uri url)? launchApproval,
  }) : _launchApproval =
           launchApproval ??
           ((url) => launchUrl(url, mode: LaunchMode.externalApplication)) {
    _observedPreparedCart = chat.lastPreparedCart;
    chat.addListener(_onChatChanged);
    if (cart.isNotEmpty) _refreshPolicy();
  }

  void _onChatChanged() {
    if (identical(_observedPreparedCart, chat.lastPreparedCart)) return;
    _observedPreparedCart = chat.lastPreparedCart;
    _quantityOverrides.clear();
    _refreshPolicy();
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    chat.removeListener(_onChatChanged);
    super.dispose();
  }

  /// Manual additions are merged with the AI-prepared cart, never substituted.
  final Map<String, int> _manualCart = <String, int>{};
  final Map<String, int> _quantityOverrides = <String, int>{};
  Map<String, int> get cart => Map.unmodifiable(_resolvedQuantities());

  bool _busy = false;
  bool get busy => _busy;


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

  void _setError(String key, [List<Object?> args = const []]) {
    _errorKey = key;
    _errorArgs = args.map((value) => value.toString()).toList(growable: false);
    _rawError = null;
  }

  void _clearError() {
    _errorKey = null;
    _errorArgs = const [];
    _rawError = null;
  }

  void _setRawError(String message) {
    _errorKey = null;
    _errorArgs = const [];
    _rawError = message;
  }

  void _setStatusMessage(String key, [List<Object?> args = const []]) {
    _statusMessageKey = key;
    _statusMessageArgs =
        args.map((value) => value.toString()).toList(growable: false);
    _rawStatusMessage = null;
  }

  void _clearStatusMessage() {
    _statusMessageKey = null;
    _statusMessageArgs = const [];
    _rawStatusMessage = null;
  }

  void setError(String message) {
    _setRawError(message);
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
    _refreshPolicy();
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
    _refreshPolicy();
    notifyListeners();
  }

  void removeProduct(String productId) {
    setQuantity(productId, 0);
  }

  Future<void> clear() async {
    if (_busy) return;
    if (hasPendingOrder) {
      _setError('checkout.errorFinishOrCancelBeforeClear');
      notifyListeners();
      return;
    }
    _busy = true;
    _clearError();
    notifyListeners();
    try {
      if (chat.lastPreparedCart != null) {
        await chat.clearPreparedCart();
      }
    } catch (error) {
      _busy = false;
      _setError('checkout.errorUnexpected', [error.toString()]);
      notifyListeners();
      return;
    }

    _manualCart.clear();
    _quantityOverrides.clear();
    _policyVersion++;
    _policyFuture = null;
    _policyStatus = CartPolicyStatus.idle;
    _clearPolicyReason();
    _created = null;
    _captured = null;
    _paypalApproved = false;
    _clearStatusMessage();
    _clearError();
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
      _setStatusMessage('checkout.statusNoPendingHandle');
      notifyListeners();
      return true;
    }
    if (token != _created!.paypalOrderId) {
      _setError('checkout.errorReturnMismatch');
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
    _setStatusMessage('checkout.statusApprovedCapture');
    _clearError();
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
    _clearError();
    notifyListeners();
    try {
      await api.cancelOrder(orderId);
      // Backend confirmed: safe to drop the pending order. Cart is preserved.
      _created = null;
      _paypalApproved = false;
      _setStatusMessage('checkout.statusPaypalCancelled');
    } on ApiException catch (e) {
      // Keep the recoverable pending order so the user can retry; surface error.
      _setError('checkout.errorCancelApi', [e.statusCode, e.message]);
      _clearStatusMessage();
    } catch (e) {
      _setError('checkout.errorUnexpected', [e.toString()]);
      _clearStatusMessage();
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  /// Explains that the matching PayPal return link is required before capture.
  /// A user assertion from the browser cannot authorize payment.
  void confirmApprovalInBrowser() {
    _setStatusMessage('checkout.statusApprovalUnconfirmed');
    _clearError();
    notifyListeners();
  }

  /// Step 1+2: create the order server-side and open the PayPal approval URL.
  Future<void> startCheckout() async {
    if (_busy) return;
    if (hasPendingOrder) {
      _setError('checkout.errorExistingOrder');
      notifyListeners();
      return;
    }
    final items = _resolveItems();
    if (items.isEmpty) {
      _setError('checkout.errorCartEmpty');
      notifyListeners();
      return;
    }

    // D-04 gate, enforced here as well as on the buttons: no order is created
    // for a cart without an allowing verdict. A verdict still in flight is
    // awaited (bounded by the API timeout); the backend remains the final check.
    if (_policyStatus == CartPolicyStatus.checking && _policyFuture != null) {
      _busy = true;
      _setStatusMessage('checkout.statusCheckingPolicy');
      notifyListeners();
      try {
        await _policyFuture;
      } finally {
        _busy = false;
        _clearStatusMessage();
      }
    }
    if (!policyAllowsCheckout) {
      if (_policyStatus == CartPolicyStatus.blocked) {
        if (policyReason == null) {
          _setError('checkout.errorPolicyBlockedGeneric');
        } else {
          _setError('checkout.errorPolicyBlocked', [policyReason]);
        }
      } else if (_policyStatus == CartPolicyStatus.error) {
        if (_policyReasonKey != null) {
          _setError(_policyReasonKey!);
        } else if (_policyReason != null) {
          _setRawError(_policyReason!);
        } else {
          _setError('checkout.errorPolicyUnavailableRetry');
        }
      } else {
        _setError('checkout.errorPolicyNotApproved');
      }
      notifyListeners();
      return;
    }
    // The cart may have changed while waiting; always send the CURRENT items.
    final currentItems = _resolveItems();

    _busy = true;
    _clearError();
    _captured = null;
    _created = null;
    _paypalApproved = false;
    _setStatusMessage('checkout.statusCreatingOrder');
    notifyListeners();

    try {
      // One stable key per logical checkout attempt (F4). It is reused if the
      // request is transparently retried (e.g. on a 401 session refresh inside
      // ApiService) and regenerated on the next startCheckout call.
      _idempotencyKey = _newIdempotencyKey();
      final result = await api.createOrder(
        items: currentItems,
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
      _setStatusMessage('checkout.statusOrderCreated');
      notifyListeners();

      final launched = await _launchApproval(approvalUri);
      _setStatusMessage(
        launched
            ? 'checkout.statusApproveAndReturn'
            : 'checkout.statusOpenPaypalRetry',
      );
      if (!launched) _setError('checkout.errorOpenApprovalPage');
    } on ApiException catch (e) {
      _setError('checkout.errorCheckoutApi', [e.statusCode, e.message]);
      _clearStatusMessage();
    } catch (e) {
      _setError('checkout.errorUnexpected', [e.toString()]);
      _clearStatusMessage();
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  Future<void> reopenApprovalPage() async {
    final approvalUrl = _created?.approvalUrl;
    final approvalUri = approvalUrl == null ? null : Uri.tryParse(approvalUrl);
    if (approvalUri == null || approvalUri.scheme != 'https') {
      _setError('checkout.errorNoSecureApprovalLink');
      return;
    }

    _busy = true;
    _clearError();
    notifyListeners();
    try {
      final launched = await _launchApproval(approvalUri);
      if (!launched) {
        _setError('checkout.errorOpenApprovalPage');
      } else {
        _setStatusMessage('checkout.statusReopenApproval');
      }
    } catch (error) {
      _setError('checkout.errorOpenPayPal', [error]);
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  /// Clears every cart source after a confirmed payment.
  ///
  /// This is safe to call repeatedly: local clears are idempotent, and the
  /// prepared-cart request is only sent while the chat still has that cart.
  Future<void> _clearCartAfterPaid({required bool alreadyCompleted}) async {
    _manualCart.clear();
    _quantityOverrides.clear();

    if (chat.lastPreparedCart == null) return;
    try {
      await chat.clearPreparedCart();
    } catch (error) {
      _setError(
        alreadyCompleted
            ? 'checkout.errorCartClearAfterAlreadyPaid'
            : 'checkout.errorCartClearAfterCapture',
        [error],
      );
    }
  }

  /// Step 3: capture the approved PayPal order.
  Future<void> completeCheckout() async {
    if (_busy) return;
    if (_created == null) {
      _setError('checkout.errorNoPendingCapture');
      notifyListeners();
      return;
    }
    if (!_paypalApproved) {
      _setError('checkout.errorApprovalRequired');
      notifyListeners();
      return;
    }

    _busy = true;
    _clearError();
    _setStatusMessage('checkout.statusCapturing');
    notifyListeners();

    try {
      final result = await api.captureOrder(_created!.orderId);
      if (result.status == 'PAID') {
        _captured = result;
        _setStatusMessage('checkout.statusCaptured', [
          result.status,
          result.paypalCaptureId != 'unknown'
              ? ' (capture ${result.paypalCaptureId})'
              : '',
        ]);
        await _clearCartAfterPaid(alreadyCompleted: false);
      } else if (result.status == 'PAYMENT_PENDING') {
        _setStatusMessage('checkout.statusPaymentPending');
      } else {
        _created = null;
        _paypalApproved = false;
        _clearStatusMessage();
        _setError('checkout.errorPaymentIncomplete');
      }
    } on ApiException catch (e) {
      // F3/Recovery 07.1: recover from stale/ambiguous pending orders WITHOUT
      // fabricating a payment outcome. A 409 "already captured" is only proof of
      // payment when the backend has independently verified a real PayPal
      // COMPLETED capture and signalled it via `details.settled == true`. Any
      // other conflict (bare idempotent 409, unverified/failed reconciliation)
      // is unresolved: keep the pending order so the user can retry and the
      // webhook/reconciler can settle it. Never invent `PAID`/`COMPLETED`.
      final msg = e.message.toLowerCase();
      if (e.statusCode == 409 &&
          msg.contains('already captured') &&
          e.settled == true) {
        // Trusted, verified completion. Reflect PAID and clear the pending
        // state. We still do not invent a capture id (the server did not return
        // one on this conflict), and this is NOT treated as a cancellation.
        _captured = OrderCaptureResult(
          orderId: _created!.orderId,
          status: 'PAID',
          paypalCaptureId: 'unknown',
          paypalStatus: 'COMPLETED',
        );
        _created = null;
        _paypalApproved = false;
        _setStatusMessage('checkout.statusAlreadyCompleted');
        await _clearCartAfterPaid(
          alreadyCompleted: true,
        );
      } else if (e.statusCode == 502 || e.statusCode == 409) {
        // Ambiguous transport / capture-in-progress / unverified 409: preserve
        // the recoverable pending order and let the user retry.
        _setError('checkout.errorCaptureUnconfirmed', [e.statusCode, e.message]);
        _clearStatusMessage();
      } else {
        _setError('checkout.errorCaptureApi', [e.statusCode, e.message]);
        _clearStatusMessage();
      }
    } catch (e) {
      _setError('checkout.errorUnexpected', [e.toString()]);
      _clearStatusMessage();
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
      _setError('checkout.errorNoPendingCancel');
      notifyListeners();
      return;
    }
    _busy = true;
    _clearError();
    notifyListeners();
    try {
      final result = await api.cancelOrder(target);
      _created = null;
      _paypalApproved = false;
      _setStatusMessage('checkout.statusOrderCancelled', [result.status]);
    } on ApiException catch (e) {
      // F3/Recovery 07.1: do not treat every error as an ordinary cancellation.
      // Preserve recoverable state and classify specific outcomes. A 409
      // "already captured" only proves payment when the backend verified a real
      // PayPal COMPLETED capture (`details.settled == true`); otherwise it is
      // unresolved and the pending order must be kept, never fabricated as PAID.
      final msg = e.message.toLowerCase();
      if (e.statusCode == 409 &&
          msg.contains('already captured') &&
          e.settled == true) {
        // The order is actually paid (server-verified); reflect that instead of
        // leaving a stale pending order. Not marked cancelled.
        _captured = OrderCaptureResult(
          orderId: target,
          status: 'PAID',
          paypalCaptureId: 'unknown',
          paypalStatus: 'COMPLETED',
        );
        _created = null;
        _paypalApproved = false;
        _setStatusMessage('checkout.statusOrderAlreadyPaid');
      } else if (e.statusCode == 404) {
        // Order no longer exists on the server: safe to drop the local pending
        // reference (nothing to cancel).
        _created = null;
        _paypalApproved = false;
        _setStatusMessage('checkout.statusOrderMissing');
      } else {
        // 502 (could not verify PayPal state), an unverified 409, or any other
        // ambiguous outcome: keep the recoverable pending order so the user can
        // retry and the webhook/reconciler can settle it.
        _setError('checkout.errorCancelApi', [e.statusCode, e.message]);
        _clearStatusMessage();
      }
    } catch (e) {
      _setError('checkout.errorUnexpected', [e.toString()]);
      _clearStatusMessage();
    } finally {
      _busy = false;
      notifyListeners();
    }
  }
}
