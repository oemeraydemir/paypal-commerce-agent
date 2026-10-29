import 'dart:convert';

import 'package:flutter/foundation.dart' show kReleaseMode;
import 'package:http/http.dart' as http;

import 'package:flutter_app/models/order.dart';
import 'package:flutter_app/models/paid_receipt.dart';
import 'package:flutter_app/models/product.dart';
import 'package:flutter_app/models/shopper_preferences.dart';
import 'package:flutter_app/models/cart.dart';
import 'package:flutter_app/models/chat_message.dart';
import 'package:flutter_app/services/session_service.dart';

/// Raised when the backend responds with a non-2xx status.
///
/// [settled] mirrors the backend's `details.settled` flag on a capture/cancel
/// conflict (HTTP 409 `Order already captured`). It is `true` **only** when the
/// server has independently confirmed a real PayPal `COMPLETED` capture before
/// reporting the conflict (see `apps/backend/src/orders/routes` +
/// `payment-lifecycle.ts`). It is `null` whenever the server did not supply a
/// verified flag — e.g. the bare idempotent 409 — in which case callers must
/// treat the payment state as unresolved and never fabricate `PAID`.
class ApiException implements Exception {
  final int statusCode;
  final String message;

  /// `true` only when the backend verified a completed PayPal capture; `null`
  /// when the backend did not assert completion. Never trust a bare 409 message
  /// on its own (see [checkout_provider.dart]).
  final bool? settled;

  ApiException(this.statusCode, this.message, {this.settled});

  @override
  String toString() => 'ApiException($statusCode): $message';
}

/// Thin HTTP client for the PayPal Commerce Agent backend.
///
/// The client only ever calls the documented REST endpoints. It has no
/// knowledge of PayPal credentials or the PayPal SDK — payments are always
/// initiated server-side. This preserves the security boundary established in
/// the backend (the AI agent prepares carts; the app asks the server to create
/// and capture orders after explicit user confirmation).
///
/// Session auth: the backend issues an anonymous session via `POST /api/sessions`
/// and requires `X-Session-Id` + `Authorization: Bearer <token>` on every
/// state-changing route. This client mints/stores that identity through an
/// injectable [SessionStorage] and attaches the headers automatically.
class ApiService {
  // The AI chat endpoint can take several seconds per tool round and, when the
  // configured provider chain needs fallbacks, routinely exceeds 15s. A 15s
  // cap caused the app to surface a spurious "AI request timed out" even though
  // the backend completed successfully (observed with 200s ~15s later). Use a
  // generous cap so slow-but-healthy AI responses are not dropped client-side.
  static const Duration _requestTimeout = Duration(seconds: 60);

  /// Base URL of the commerce-agent backend.
  ///
  /// Supply the backend address at build time with
  /// `--dart-define=API_BASE_URL=https://your-backend.example`. The emulator
  /// development host (`http://10.0.2.2:3000`) is only used for **debug**
  /// builds and is injected as the `defaultValue` below. Release builds must
  /// pass an explicit HTTPS URL — see [resolveBaseUrl], which rejects the
  /// emulator/cleartext default in release so a production build can never
  /// silently talk to an unintended host.
  static const String defaultBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000',
  );

  /// Resolves the base URL for the current build mode.
  ///
  /// - **Debug/profile:** returns [defaultBaseUrl] (the emulator host by
  ///   default). HTTP is permitted because it is guarded by a debug-only
  ///   cleartext allowance in the Android manifest.
  /// - **Release:** requires an explicit HTTPS `API_BASE_URL`. A missing or
  ///   insecure (http://) value throws a [StateError] instead of silently
  ///   falling back to the emulator host.
  ///
  /// [isRelease] and [url] are exposed purely so tests can exercise the
  /// release branch without a compile-time `--dart-define`; production code
  /// uses the real [kReleaseMode] and [defaultBaseUrl] by default.
  static String resolveBaseUrl({bool isRelease = kReleaseMode, String? url}) {
    final resolved = url ?? defaultBaseUrl;
    if (isRelease) {
      if (resolved.isEmpty) {
        throw StateError(
          'API_BASE_URL must be supplied for release builds via '
          '--dart-define=API_BASE_URL=https://<backend>',
        );
      }
      final uri = Uri.tryParse(resolved);
      if (uri == null || uri.scheme != 'https') {
        throw StateError(
          'API_BASE_URL must be an https:// URL in release builds '
          '(got scheme "${uri?.scheme ?? 'none'}"). '
          'Refusing to send credentials over cleartext transport.',
        );
      }
      return resolved;
    }
    return resolved.isNotEmpty ? resolved : 'http://10.0.2.2:3000';
  }

  final http.Client _client;
  final String _baseUrl;
  final SessionStorage _storage;

  /// Single-flight guard for session creation (F5). When non-null, a creation
  /// is already in flight and concurrent callers await this future instead of
  /// minting a second session for the same logical identity.
  Future<void>? _sessionCreation;

  ApiService({http.Client? client, String? baseUrl, required this._storage})
    : _client = client ?? http.Client(),
      _baseUrl = (baseUrl ?? resolveBaseUrl()).replaceFirst(RegExp(r'/$'), '');

  Uri _url(String path) => Uri.parse('$_baseUrl$path');

  /// Base URL used to build links that are opened outside the app (receipt QR).
  String get publicBaseUrl => _baseUrl;

  /// Ensures a server-issued session exists, minting one via `POST /api/sessions`
  /// when the store is empty. Throws [SessionException] on failure so callers
  /// fail clearly instead of silently proceeding unauthenticated (requirement 7).
  /// Reads the session identity as a single atomic snapshot so callers never
  /// observe a half-written or cleared identity split across two awaits (F5).
  Future<({String? id, String? token})> _readSessionSnapshot() async {
    final id = await _storage.getSessionId();
    final token = await _storage.getToken();
    return (id: id, token: token);
  }

  /// Ensures a server-issued session exists. Concurrent first requests share a
  /// single session-creation future (single-flight) so we never mint two
  /// sessions for one logical identity (F5).
  Future<void> _ensureSession() async {
    final snapshot = await _readSessionSnapshot();
    final hasValid =
        snapshot.id != null &&
        snapshot.id!.isNotEmpty &&
        snapshot.token != null &&
        snapshot.token!.isNotEmpty;
    if (hasValid) return;

    // Single-flight: if a creation is already in flight, await the shared future
    // instead of starting a second one.
    if (_sessionCreation != null) {
      await _sessionCreation;
      final after = await _readSessionSnapshot();
      final stillValid =
          after.id != null &&
          after.id!.isNotEmpty &&
          after.token != null &&
          after.token!.isNotEmpty;
      if (stillValid) return;
      // The shared creation failed; fall through to retry ourselves.
    }

    final creation = _createSession();
    _sessionCreation = creation;
    try {
      await creation;
    } finally {
      // Clear the guard only for our own future so a concurrent caller still
      // attached to it is not orphaned, and so a later call can retry if this
      // one failed.
      if (identical(_sessionCreation, creation)) {
        _sessionCreation = null;
      }
    }
  }

  Future<void> _createSession() async {
    final response = await _client
        .post(
          _url('/api/sessions'),
          headers: {'Content-Type': 'application/json'},
        )
        .timeout(_requestTimeout);

    if (response.statusCode != 201) {
      throw const SessionException('session creation failed');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    // The backend field is `sessionToken` (not `token`).
    final sessionId = data['sessionId'];
    final token = data['sessionToken'];
    if (sessionId is! String ||
        sessionId.isEmpty ||
        token is! String ||
        token.isEmpty) {
      throw const SessionException('malformed session response');
    }

    await _storage.saveSession(sessionId: sessionId, token: token);
  }

  Future<Map<String, String>> _authHeaders() async {
    final snapshot = await _readSessionSnapshot();
    final headers = <String, String>{'Content-Type': 'application/json'};
    if (snapshot.id != null && snapshot.id!.isNotEmpty) {
      headers['X-Session-Id'] = snapshot.id!;
    }
    if (snapshot.token != null && snapshot.token!.isNotEmpty) {
      headers['Authorization'] = 'Bearer ${snapshot.token}';
    }
    return headers;
  }

  /// Runs an authenticated request, refreshing the session once on a 401.
  ///
  /// The [request] closure is invoked with fresh headers on every attempt, so
  /// any idempotency key or body is preserved across the retry. There is exactly
  /// one retry — no infinite loop.
  Future<http.Response> _executeWithAuth(
    Future<http.Response> Function(Map<String, String> headers) request,
  ) async {
    Future<http.Response> attempt() async {
      await _ensureSession();
      final headers = await _authHeaders();
      return request(headers);
    }

    var response = await attempt().timeout(_requestTimeout);
    if (response.statusCode == 401) {
      await _storage.clear();
      // Force a fresh session on the retry rather than reusing the invalidated
      // one. This also prevents a stale concurrent request from clearing a newer
      // valid session (F5).
      _sessionCreation = null;
      response = await attempt().timeout(_requestTimeout);
    }
    return response;
  }

  // ---------------------------------------------------------------------------
  // Public, unauthenticated endpoints (independent of secure session storage).
  // ---------------------------------------------------------------------------

  Future<List<Product>> getCatalog() async {
    final res = await _client
        .get(_url('/api/catalog'))
        .timeout(_requestTimeout);
    _ensureOk(res, 'getCatalog');
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    final products = (body['products'] as List? ?? const <dynamic>[]);
    return products
        .whereType<Map<String, dynamic>>()
        .map(Product.fromJson)
        // A product without an id cannot be ordered; skip it rather than
        // surfacing an unusable chip.
        .where((product) => product.id.isNotEmpty)
        .toList();
  }

  Future<HealthStatus> getHealth() async {
    final res = await _client.get(_url('/api/health')).timeout(_requestTimeout);
    _ensureOk(res, 'getHealth');
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return HealthStatus.fromJson(body);
  }

  // ---------------------------------------------------------------------------
  // Authenticated endpoints.
  // ---------------------------------------------------------------------------

  Future<ChatResponse> sendChat({
    required String message,
    ShopperPreferences? preferences,
  }) async {
    final res = await _executeWithAuth((headers) async {
      final sessionId = await _storage.getSessionId();
      return _client.post(
        _url('/api/ai/chat'),
        headers: headers,
        body: jsonEncode({
          'sessionId': sessionId,
          'message': message,
          if (preferences != null) 'preferences': preferences.toJson(),
        }),
      );
    });
    _ensureOk(res, 'sendChat');
    return ChatResponse.fromJson(_decodeChatBody(res));
  }

  /// Decodes a chat body defensively: an empty, non-JSON or non-object 2xx body
  /// yields an empty map so [ChatResponse] falls back to safe defaults instead
  /// of throwing on a malformed payload.
  Map<String, dynamic> _decodeChatBody(http.Response res) {
    if (res.body.trim().isEmpty) return const <String, dynamic>{};
    try {
      final decoded = jsonDecode(res.body);
      return decoded is Map<String, dynamic>
          ? decoded
          : const <String, dynamic>{};
    } on FormatException {
      return const <String, dynamic>{};
    }
  }

  Future<void> deleteChat() async {
    final existing = await _storage.getSessionId();
    if (existing == null || existing.isEmpty) return; // nothing to clear
    final res = await _executeWithAuth((headers) async {
      // Read the (possibly refreshed) session id *inside* the closure so a 401
      // retry uses the current session, never the stale id captured before the
      // retry (F1).
      final sessionId = await _storage.getSessionId();
      if (sessionId == null || sessionId.isEmpty) {
        return http.Response('', 204);
      }
      return _client.delete(_url('/api/ai/chat/$sessionId'), headers: headers);
    });
    // 404 just means there was nothing to clear.
    if (res.statusCode >= 400 && res.statusCode != 404) {
      throw ApiException(res.statusCode, _errMsg(res));
    }
  }

  Future<void> deletePreparedCart() async {
    final existing = await _storage.getSessionId();
    if (existing == null || existing.isEmpty) return;
    final res = await _executeWithAuth((headers) async {
      final sessionId = await _storage.getSessionId();
      if (sessionId == null || sessionId.isEmpty) {
        return http.Response('', 204);
      }
      return _client.delete(_url('/api/ai/cart/$sessionId'), headers: headers);
    });
    _ensureOk(res, 'deletePreparedCart');
  }

  /// Asks the server for the authoritative policy verdict of [items]. The server
  /// remains the security boundary; this only lets the UI show it before checkout.
  Future<PolicyPreview> previewPolicy(List<OrderItem> items) async {
    final res = await _executeWithAuth((headers) async {
      return _client.post(
        _url('/api/policy/preview'),
        headers: headers,
        body: jsonEncode({'items': items.map((e) => e.toJson()).toList()}),
      );
    });
    _ensureOk(res, 'previewPolicy');
    return PolicyPreview.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  /// The session-scoped spending allowance (`GET /api/policy`).
  Future<PolicyAllowance> fetchPolicy() async {
    final res = await _executeWithAuth((headers) async {
      return _client.get(_url('/api/policy'), headers: headers);
    });
    _ensureOk(res, 'fetchPolicy');
    return PolicyAllowance.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  /// Updates the caller's own allowance (`PATCH /api/policy`). Only whitelisted
  /// fields are accepted server-side; returns the new authoritative state.
  Future<PolicyAllowance> updatePolicy({
    int? maxPerPurchaseMinor,
    int? dailySpendLimitMinor,
    int? confirmationThresholdMinor,
    String? validUntil,
  }) async {
    final body = <String, dynamic>{};
    if (maxPerPurchaseMinor != null) body['maxPerPurchaseMinor'] = maxPerPurchaseMinor;
    if (dailySpendLimitMinor != null) body['dailySpendLimitMinor'] = dailySpendLimitMinor;
    if (confirmationThresholdMinor != null) body['confirmationThresholdMinor'] = confirmationThresholdMinor;
    if (validUntil != null) body['validUntil'] = validUntil;
    final res = await _executeWithAuth((headers) async {
      return _client.patch(_url('/api/policy'), headers: headers, body: jsonEncode(body));
    });
    _ensureOk(res, 'updatePolicy');
    return PolicyAllowance.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<OrderCreateResult> createOrder({
    required List<OrderItem> items,
    String? idempotencyKey,
  }) async {
    final res = await _executeWithAuth((headers) async {
      if (idempotencyKey != null) {
        headers['Idempotency-Key'] = idempotencyKey;
      }
      final sessionId = await _storage.getSessionId();
      return _client.post(
        _url('/api/orders/create'),
        headers: headers,
        body: jsonEncode({
          'sessionId': sessionId,
          'items': items.map((e) => e.toJson()).toList(),
        }),
      );
    });
    _ensureOk(res, 'createOrder');
    return OrderCreateResult.fromJson(
      jsonDecode(res.body) as Map<String, dynamic>,
    );
  }

  Future<OrderCaptureResult> captureOrder(String orderId) async {
    final res = await _executeWithAuth(
      (headers) =>
          _client.post(_url('/api/orders/$orderId/capture'), headers: headers),
    );
    _ensureOk(res, 'captureOrder');
    return OrderCaptureResult.fromJson(
      jsonDecode(res.body) as Map<String, dynamic>,
    );
  }

  /// Recovers a payment whose deep-link return arrives when the app has no
  /// local pending order (e.g. after an app restart). Backed by
  /// `GET /api/orders/pending?token=`. Returns `null` when there is no matching
  /// pending order.
  Future<OrderCreateResult?> recoverPendingOrder(String token) async {
    final res = await _executeWithAuth((headers) async {
      return _client.get(
        _url('/api/orders/pending?token=$token'),
        headers: headers,
      );
    });
    if (res.statusCode == 404 || res.statusCode == 204) return null;
    _ensureOk(res, 'recoverPendingOrder');
    return OrderCreateResult.fromJson(
      jsonDecode(res.body) as Map<String, dynamic>,
    );
  }

  /// The shopper's own signed Cart Mandate for an order (`GET /api/orders/:id/mandate`).
  /// Returns `null` when the payload is not what the receipt expects; the
  /// receipt then simply has no QR code.
  Future<MandateSummary?> getMandate(String orderId) async {
    final res = await _executeWithAuth(
      (headers) =>
          _client.get(_url('/api/orders/$orderId/mandate'), headers: headers),
    );
    _ensureOk(res, 'getMandate');
    return MandateSummary.tryParse(jsonDecode(res.body));
  }

  /// Cancels a not-yet-captured order. Backed by `POST /api/orders/:orderId/cancel`
  /// (confirmed in the backend routes). The server enforces ownership and refuses
  /// to cancel already-paid orders, so this is payment-safe. The cart is never
  /// cleared here (the caller decides that). Does not invent a response contract.
  Future<OrderCancelResult> cancelOrder(String orderId) async {
    final res = await _executeWithAuth(
      (headers) =>
          _client.post(_url('/api/orders/$orderId/cancel'), headers: headers),
    );
    _ensureOk(res, 'cancelOrder');
    return OrderCancelResult.fromJson(
      jsonDecode(res.body) as Map<String, dynamic>,
    );
  }

  void _ensureOk(http.Response res, String op) {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw ApiException(
        res.statusCode,
        _errMsg(res, op),
        settled: _settledFlag(res),
      );
    }
  }

  /// Reads the backend's verified-completion flag from a 409 capture/cancel
  /// conflict body (`{ error, details: { settled } }`). Returns `true`/`false`
  /// only when the backend explicitly supplied a boolean; `null` otherwise so
  /// the caller can distinguish "server did not assert completion" from a
  /// verified `false`. See [ApiException.settled].
  bool? _settledFlag(http.Response res) {
    try {
      final b = jsonDecode(res.body);
      if (b is Map) {
        final details = b['details'];
        if (details is Map && details['settled'] is bool) {
          return details['settled'] as bool;
        }
      }
    } catch (_) {
      // ignore parse errors, fall through to "not supplied"
    }
    return null;
  }

  String _errMsg(http.Response res, [String? op]) {
    try {
      final b = jsonDecode(res.body);
      if (b is Map) {
        if (b['error'] != null) return b['error'].toString();
        if (b['message'] != null) return b['message'].toString();
      }
    } catch (_) {
      // ignore parse errors, fall through to generic message
    }
    return 'HTTP ${res.statusCode}${op != null ? ' ($op)' : ''}';
  }

  void dispose() => _client.close();
}

/// Result of `POST /api/orders/:orderId/cancel`.
class OrderCancelResult {
  final String orderId;
  final String status;

  const OrderCancelResult({required this.orderId, required this.status});

  factory OrderCancelResult.fromJson(Map<String, dynamic> json) =>
      OrderCancelResult(
        orderId: json['orderId'] as String,
        status: json['status'] as String,
      );
}

/// Response of `POST /api/ai/chat`.
///
/// Contract (from `apps/backend/src/routes/ai.ts`):
/// `{ sessionId, response, preparedCart, checkoutReady, toolRounds,
///    messageCount, mode }` — `mode` is `"ai"` for a normal AI answer and
/// `"rule-based"` for the deterministic, explicitly non-AI fallback.
class ChatResponse {
  final String sessionId;
  final String response;
  final PreparedCart? preparedCart;
  final bool checkoutReady;
  final int toolRounds;
  final int messageCount;

  /// Backend-declared mode; `null` when omitted/unknown (backward compatible).
  final ChatMode? mode;

  /// Which AI provider answered (e.g. `groq`) and whether an earlier provider
  /// failed first. Both are `null`/`false` for older backends. Names only.
  final String? provider;
  final bool fallback;

  /// Over-budget manual add-anyway offer (rule-based replies only).
  final ChatSuggestion? suggestion;

  ChatResponse({
    required this.sessionId,
    required this.response,
    required this.preparedCart,
    required this.checkoutReady,
    required this.toolRounds,
    required this.messageCount,
    this.mode,
    this.provider,
    this.fallback = false,
    this.suggestion,
  });

  bool get isRuleBased => mode == ChatMode.ruleBased;

  factory ChatResponse.fromJson(Map<String, dynamic> json) {
    final rawCart = json['preparedCart'];
    return ChatResponse(
      sessionId: json['sessionId'] as String? ?? '',
      response: json['response'] as String? ?? '',
      preparedCart: rawCart is Map<String, dynamic>
          ? PreparedCart.fromJson(rawCart)
          : null,
      checkoutReady: json['checkoutReady'] as bool? ?? false,
      toolRounds: (json['toolRounds'] as num?)?.toInt() ?? 0,
      messageCount: (json['messageCount'] as num?)?.toInt() ?? 0,
      mode: chatModeFromJson(json['mode']),
      provider: json['provider'] is String ? json['provider'] as String : null,
      fallback: json['fallback'] == true,
      suggestion: ChatSuggestion.tryParse(json['suggestion']),
    );
  }
}
