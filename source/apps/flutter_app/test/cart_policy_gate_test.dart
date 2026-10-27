import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/providers/chat_provider.dart';
import 'package:flutter_app/providers/checkout_provider.dart';
import 'package:flutter_app/services/api_service.dart';
import 'package:flutter_app/services/session_service.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response _preview(String decision, {String? reason}) => http.Response(
  jsonEncode({
    'empty': false,
    'decision': decision,
    'reason': reason ?? 'ok',
  }),
  200,
);

CheckoutProvider _provider(Future<http.Response> Function(http.Request) onPreview) {
  final client = MockClient((request) async {
    if (request.method == 'POST' && request.url.path == '/api/sessions') {
      return http.Response(
        jsonEncode({
          'sessionId': 'sess-abc',
          'sessionToken': 'tok-xyz',
          'expiresAt': '2099-01-01T00:00:00.000Z',
        }),
        201,
      );
    }
    if (request.url.path == '/api/policy/preview') return onPreview(request);
    return http.Response('{}', 404);
  });
  final api = ApiService(
    baseUrl: 'http://localhost:3000',
    storage: InMemorySessionStorage(),
    client: client,
  );
  return CheckoutProvider(api, ChatProvider(api));
}

/// Like [_provider] but also records `POST /api/orders/create` requests, so the
/// direct `startCheckout()` path can be asserted to send (or not send) an order.
CheckoutProvider _providerWithOrders(
  Future<http.Response> Function(http.Request) onPreview,
  List<http.Request> createRequests,
) {
  final client = MockClient((request) async {
    if (request.method == 'POST' && request.url.path == '/api/sessions') {
      return http.Response(
        jsonEncode({
          'sessionId': 'sess-abc',
          'sessionToken': 'tok-xyz',
          'expiresAt': '2099-01-01T00:00:00.000Z',
        }),
        201,
      );
    }
    if (request.url.path == '/api/policy/preview') return onPreview(request);
    if (request.url.path == '/api/orders/create') {
      createRequests.add(request);
      return http.Response(
        jsonEncode({
          'orderId': 'order-1',
          'paypalOrderId': 'paypal-1',
          'status': 'PAYMENT_PENDING',
          'origin': 'MANUAL',
          'totalMinor': 300,
          'totalFormatted': 'EUR 3.00',
          'currency': 'EUR',
          'approvalUrl': 'https://www.sandbox.paypal.com/checkout',
        }),
        200,
      );
    }
    return http.Response('{}', 404);
  });
  final api = ApiService(
    baseUrl: 'http://localhost:3000',
    storage: InMemorySessionStorage(),
    client: client,
  );
  return CheckoutProvider(api, ChatProvider(api), launchApproval: (_) async => true);
}

Future<void> _settle() => Future<void>.delayed(const Duration(milliseconds: 20));

void main() {
  group('cart policy gate (D-04)', () {
    test('sends productId and the new quantity on every change', () async {
      final bodies = <Map<String, dynamic>>[];
      final checkout = _provider((req) async {
        bodies.add(jsonDecode(req.body) as Map<String, dynamic>);
        return _preview('AUTO_ALLOW');
      });
      checkout.addProduct('coffee');
      await _settle();
      checkout.setQuantity('coffee', 3);
      await _settle();
      expect(bodies.first['items'], [
        {'productId': 'coffee', 'quantity': 1},
      ]);
      expect(bodies.last['items'], [
        {'productId': 'coffee', 'quantity': 3},
      ]);
      expect(checkout.policyStatus, CartPolicyStatus.allowed);
      expect(checkout.policyAllowsCheckout, isTrue);
    });

    test('pay stays disabled while the verdict is pending', () async {
      final gate = Completer<http.Response>();
      final checkout = _provider((_) => gate.future);
      checkout.addProduct('coffee');
      await _settle();
      expect(checkout.policyStatus, CartPolicyStatus.checking);
      expect(checkout.policyAllowsCheckout, isFalse);
      gate.complete(_preview('REQUIRE_CONFIRMATION'));
      await _settle();
      expect(checkout.policyStatus, CartPolicyStatus.needsApproval);
      expect(checkout.policyAllowsCheckout, isTrue);
    });

    test('a late answer for an OLD cart never overrides the newest cart', () async {
      final first = Completer<http.Response>();
      var call = 0;
      final checkout = _provider((_) {
        call++;
        if (call == 1) return first.future; // slow reply for the first cart
        return Future.value(_preview('BLOCK', reason: 'over the limit'));
      });
      checkout.addProduct('coffee'); // request 1 (slow, would say ALLOW)
      await _settle();
      checkout.setQuantity('coffee', 7); // request 2 (fast, BLOCK)
      await _settle();
      expect(checkout.policyStatus, CartPolicyStatus.blocked);
      first.complete(_preview('AUTO_ALLOW')); // stale reply arrives last
      await _settle();
      expect(checkout.policyStatus, CartPolicyStatus.blocked);
      expect(checkout.policyAllowsCheckout, isFalse);
    });

    test('rapid consecutive edits: only the last request decides', () async {
      var call = 0;
      final checkout = _provider((_) async {
        call++;
        return _preview(call < 3 ? 'AUTO_ALLOW' : 'BLOCK', reason: 'limit');
      });
      checkout.addProduct('coffee');
      checkout.setQuantity('coffee', 2);
      checkout.setQuantity('coffee', 9);
      await _settle();
      expect(checkout.policyStatus, CartPolicyStatus.blocked);
    });

    test('policy refusal keeps checkout disabled and exposes the reason', () async {
      final checkout = _provider(
        (_) async => _preview('BLOCK', reason: 'EUR 2.00 over the limit'),
      );
      checkout.addProduct('gift-box');
      await _settle();
      expect(checkout.policyAllowsCheckout, isFalse);
      expect(checkout.policyReason, contains('over the limit'));
    });

    test('API error fails closed (no checkout without a verdict)', () async {
      final checkout = _provider((_) async => http.Response('boom', 500));
      checkout.addProduct('coffee');
      await _settle();
      expect(checkout.policyStatus, CartPolicyStatus.error);
      expect(checkout.policyAllowsCheckout, isFalse);
    });

    test('an unreadable decision is treated as an error, never as allowed', () async {
      final checkout = _provider(
        (_) async => http.Response(jsonEncode({'empty': false}), 200),
      );
      checkout.addProduct('coffee');
      await _settle();
      expect(checkout.policyStatus, CartPolicyStatus.error);
      expect(checkout.policyAllowsCheckout, isFalse);
    });

    test('timeout fails closed (no checkout without a verdict)', () async {
      // Simulates the TimeoutException ApiService raises after its 15 s limit.
      final checkout = _provider((_) async => throw TimeoutException('slow'));
      checkout.addProduct('coffee');
      await _settle();
      expect(checkout.policyStatus, CartPolicyStatus.error);
      expect(checkout.policyAllowsCheckout, isFalse);
    });

    test('an ALLOW for an old cart does not open payment for a newer pending cart', () async {
      final first = Completer<http.Response>();
      final second = Completer<http.Response>();
      var call = 0;
      final checkout = _provider((_) {
        call++;
        return call == 1 ? first.future : second.future;
      });
      checkout.addProduct('coffee');
      await _settle();
      checkout.setQuantity('coffee', 5);
      await _settle();
      first.complete(_preview('AUTO_ALLOW')); // stale ALLOW arrives first
      await _settle();
      expect(checkout.policyStatus, CartPolicyStatus.checking);
      expect(checkout.policyAllowsCheckout, isFalse);
      second.complete(_preview('AUTO_ALLOW'));
      await _settle();
      expect(checkout.policyAllowsCheckout, isTrue);
    });

    test('an empty cart sends no preview and never allows checkout', () async {
      var calls = 0;
      final checkout = _provider((_) async {
        calls++;
        return _preview('AUTO_ALLOW');
      });
      checkout.addProduct('coffee');
      await _settle();
      expect(calls, 1);
      checkout.setQuantity('coffee', 0);
      await _settle();
      expect(calls, 1);
      expect(checkout.policyStatus, CartPolicyStatus.idle);
      expect(checkout.policyAllowsCheckout, isFalse);
    });

    test('invalid quantities are rejected locally or fail closed on a 400', () async {
      final checkout = _provider(
        (_) async => http.Response(
          jsonEncode({'error': 'Invalid quantity for coffee: 101'}),
          400,
        ),
      );
      expect(() => checkout.addProduct('coffee', qty: 0), throwsArgumentError);
      expect(() => checkout.addProduct('coffee', qty: -2), throwsArgumentError);
      checkout.setQuantity('coffee', 101);
      await _settle();
      expect(checkout.policyStatus, CartPolicyStatus.error);
      expect(checkout.policyAllowsCheckout, isFalse);
    });

    test('startCheckout() called directly sends no order when the policy BLOCKs', () async {
      final creates = <http.Request>[];
      final checkout = _providerWithOrders(
        (_) async => _preview('BLOCK', reason: 'EUR 2.00 over the limit'),
        creates,
      );
      checkout.addProduct('gift-box');
      await _settle();
      await checkout.startCheckout();
      expect(creates, isEmpty);
      expect(checkout.created, isNull);
      expect(checkout.error, contains('over the limit'));
    });

    test('startCheckout() called directly sends no order after an API error', () async {
      final creates = <http.Request>[];
      final checkout = _providerWithOrders(
        (_) async => http.Response('boom', 500),
        creates,
      );
      checkout.addProduct('coffee');
      await _settle();
      await checkout.startCheckout();
      expect(creates, isEmpty);
      expect(checkout.error, isNotNull);
    });

    test('startCheckout() waits for a pending verdict and then honours a BLOCK', () async {
      final creates = <http.Request>[];
      final gate = Completer<http.Response>();
      final checkout = _providerWithOrders((_) => gate.future, creates);
      checkout.addProduct('coffee');
      await _settle();
      final pending = checkout.startCheckout();
      gate.complete(_preview('BLOCK', reason: 'limit'));
      await pending;
      expect(creates, isEmpty);
      expect(checkout.busy, isFalse);
    });

    test('allowed cart: checkout request carries productId, quantity and the key', () async {
      final creates = <http.Request>[];
      final checkout = _providerWithOrders(
        (_) async => _preview('AUTO_ALLOW'),
        creates,
      );
      checkout.addProduct('coffee');
      checkout.setQuantity('coffee', 2);
      await checkout.startCheckout();
      expect(creates, hasLength(1));
      final body = jsonDecode(creates.single.body) as Map<String, dynamic>;
      expect(body['items'], [
        {'productId': 'coffee', 'quantity': 2},
      ]);
      expect(creates.single.headers['idempotency-key'], isNotEmpty);
      expect(checkout.created, isNotNull);
    });
  });
}
