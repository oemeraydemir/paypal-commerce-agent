import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/providers/chat_provider.dart';
import 'package:flutter_app/providers/checkout_provider.dart';
import 'package:flutter_app/services/api_service.dart';
import 'package:flutter_app/services/session_service.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Recovery 07.1 — capture-state regression tests.
///
/// These lock in the security rule established by the Recovery 07.1 fix: the
/// Flutter client must **never** fabricate a `PAID`/`COMPLETED` payment outcome
/// from an HTTP 409 "already captured" on its own. It may only reflect PAID when
/// the backend has independently verified a real PayPal `COMPLETED` capture and
/// signalled that with `details.settled == true` (see apps/backend/src/orders
/// routes + payment-lifecycle.ts). Every other conflict — a bare idempotent
/// 409, a failed/unverified reconciliation (`settled: false`), or an ambiguous
/// pending capture — keeps the checkout pending so the user can retry and the
/// webhook/reconciler can settle it.
///
/// The same rule is enforced on both `completeCheckout()` and `cancelCheckout()`.

/// Like the helper in `checkout_provider_test.dart`: answers `POST /api/sessions`
/// with a valid, server-shaped session so authenticated provider flows can run.
MockClient withSession(Future<http.Response> Function(http.Request) handler) {
  return MockClient((request) async {
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
    return handler(request);
  });
}

/// Standard `POST /api/orders/create` reply (a pending manual order).
http.Response _createdOrderResponse() => http.Response(
  jsonEncode({
    'orderId': 'order-1',
    'paypalOrderId': 'paypal-1',
    'status': 'PAYMENT_PENDING',
    'origin': 'MANUAL',
    'totalMinor': 500,
    'totalFormatted': 'EUR 5.00',
    'currency': 'EUR',
    'approvalUrl': 'https://www.sandbox.paypal.com/checkout',
  }),
  200,
);

/// Drives a checkout to the approved, pending-capture state via the genuine
/// PayPal return deep link (never the insecure browser fallback).
Future<CheckoutProvider> _driveToApproved(ApiService api) async {
  final chat = ChatProvider(api);
  final checkout = CheckoutProvider(
    api,
    chat,
    launchApproval: (_) async => true,
  );
  checkout.addProduct('coffee');
  await checkout.startCheckout();
  final approved = await checkout.handlePayPalReturn(
    Uri.parse('paypalcommerceagent://checkout/success?token=paypal-1'),
  );
  expect(approved, isTrue);
  expect(checkout.paypalApproved, isTrue);
  return checkout;
}

void main() {
  group('Recovery 07.1 capture state', () {
    test('unverified 409 (no details.settled) keeps the order pending, not PAID', () async {
      final api = ApiService(
        baseUrl: 'http://localhost:3000',
        storage: InMemorySessionStorage(),
        client: withSession((request) async {
          if (request.url.path == '/api/orders/create') {
            return _createdOrderResponse();
          }
          if (request.url.path.contains('/capture')) {
            // Bare 409 "already captured" WITHOUT a verified settled flag: the
            // backend did NOT prove a COMPLETED capture. Not payment.
            return http.Response(
              jsonEncode({'error': 'Order already captured'}),
              409,
            );
          }
          return http.Response('Not found', 404);
        }),
      );
      final checkout = await _driveToApproved(api);
      addTearDown(checkout.dispose);
      addTearDown(api.dispose);

      await checkout.completeCheckout();

      // NOT paid: the pending order is preserved and an error is surfaced so the
      // user can retry. No fabricated PAID/COMPLETED.
      expect(checkout.captured, isNull);
      expect(checkout.created, isNotNull);
      expect(checkout.hasPendingOrder, isTrue);
      expect(checkout.paypalApproved, isTrue);
      expect(checkout.error, isNotNull);
    });
    test(
      'verified completion (409 details.settled == true) reflects PAID',
      () async {
        final api = ApiService(
          baseUrl: 'http://localhost:3000',
          storage: InMemorySessionStorage(),
          client: withSession((request) async {
            if (request.url.path == '/api/orders/create') {
              return _createdOrderResponse();
            }
            if (request.url.path.contains('/capture')) {
              return http.Response(
                jsonEncode({
                  'error': 'Order already captured',
                  'details': {'settled': true},
                }),
                409,
              );
            }
            return http.Response('Not found', 404);
          }),
        );
        final checkout = await _driveToApproved(api);
        addTearDown(checkout.dispose);
        addTearDown(api.dispose);

        await checkout.completeCheckout();

        // Server-verified completion is the ONLY case that may become PAID.
        expect(checkout.captured?.status, 'PAID');
        expect(checkout.created, isNull);
        expect(checkout.error, isNull);
      },
    );

    test(
      'pending capture (200 PAYMENT_PENDING) keeps the order pending',
      () async {
        final api = ApiService(
          baseUrl: 'http://localhost:3000',
          storage: InMemorySessionStorage(),
          client: withSession((request) async {
            if (request.url.path == '/api/orders/create') {
              return _createdOrderResponse();
            }
            if (request.url.path.contains('/capture')) {
              return http.Response(
                jsonEncode({
                  'orderId': 'order-1',
                  'status': 'PAYMENT_PENDING',
                  'paypalCaptureId': 'unknown',
                  'paypalStatus': 'PENDING',
                }),
                200,
              );
            }
            return http.Response('Not found', 404);
          }),
        );
        final checkout = await _driveToApproved(api);
        addTearDown(checkout.dispose);
        addTearDown(api.dispose);

        await checkout.completeCheckout();

        // A pending capture is ambiguous: keep the pending order, do not mark
        // paid, do not drop state.
        expect(checkout.captured, isNull);
        expect(checkout.hasPendingOrder, isTrue);
        expect(checkout.created, isNotNull);
        expect(checkout.error, isNull);
      },
    );

    test('failed reconciliation (409 details.settled == false) keeps pending', () async {
      final api = ApiService(
        baseUrl: 'http://localhost:3000',
        storage: InMemorySessionStorage(),
        client: withSession((request) async {
          if (request.url.path == '/api/orders/create') {
            return _createdOrderResponse();
          }
          if (request.url.path.contains('/capture')) {
            // The backend tried to reconcile with PayPal and could NOT verify a
            // COMPLETED capture (settled == false). Unresolved: keep pending,
            // never fabricate PAID.
            return http.Response(
              jsonEncode({
                'error': 'Order already captured',
                'details': {'settled': false},
              }),
              409,
            );
          }
          return http.Response('Not found', 404);
        }),
      );
      final checkout = await _driveToApproved(api);
      addTearDown(checkout.dispose);
      addTearDown(api.dispose);

      await checkout.completeCheckout();

      expect(checkout.captured, isNull);
      expect(checkout.hasPendingOrder, isTrue);
      expect(checkout.created, isNotNull);
      expect(checkout.error, isNotNull);
    });

    test(
      'cancellation: verified 409 (settled == true) reflects PAID, not cancel',
      () async {
        final api = ApiService(
          baseUrl: 'http://localhost:3000',
          storage: InMemorySessionStorage(),
          client: withSession((request) async {
            if (request.url.path == '/api/orders/create') {
              return _createdOrderResponse();
            }
            if (request.url.path.contains('/cancel')) {
              return http.Response(
                jsonEncode({
                  'error': 'Order already captured',
                  'details': {'settled': true},
                }),
                409,
              );
            }
            return http.Response('Not found', 404);
          }),
        );
        final chat = ChatProvider(api);
        final checkout = CheckoutProvider(
          api,
          chat,
          launchApproval: (_) async => true,
        );
        addTearDown(checkout.dispose);
        addTearDown(api.dispose);

        checkout.addProduct('coffee');
        await checkout.startCheckout();

        await checkout.cancelCheckout();

        // Verified paid via the cancel path: reflect PAID and clear pending.
        expect(checkout.captured?.status, 'PAID');
        expect(checkout.created, isNull);
        expect(checkout.error, isNull);
      },
    );

    test('cancellation: unverified 409 keeps the order pending (not paid, not '
        'cancelled)', () async {
      final api = ApiService(
        baseUrl: 'http://localhost:3000',
        storage: InMemorySessionStorage(),
        client: withSession((request) async {
          if (request.url.path == '/api/orders/create') {
            return _createdOrderResponse();
          }
          if (request.url.path.contains('/cancel')) {
            // No verified settled flag: unresolved. Must not be treated as
            // paid and must not be silently dropped as cancelled.
            return http.Response(
              jsonEncode({'error': 'Order already captured'}),
              409,
            );
          }
          return http.Response('Not found', 404);
        }),
      );
      final chat = ChatProvider(api);
      final checkout = CheckoutProvider(
        api,
        chat,
        launchApproval: (_) async => true,
      );
      addTearDown(checkout.dispose);
      addTearDown(api.dispose);

      checkout.addProduct('coffee');
      await checkout.startCheckout();

      await checkout.cancelCheckout();

      expect(checkout.captured, isNull);
      expect(checkout.created, isNotNull);
      expect(checkout.hasPendingOrder, isTrue);
      expect(checkout.error, isNotNull);
      expect(checkout.statusMessage, isNull);
    });
  });
}
