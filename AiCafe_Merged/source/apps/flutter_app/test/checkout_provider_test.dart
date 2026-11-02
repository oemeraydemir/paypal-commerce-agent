import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/providers/chat_provider.dart';
import 'package:flutter_app/providers/checkout_provider.dart';
import 'package:flutter_app/services/api_service.dart';
import 'package:flutter_app/services/session_service.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Like the helper in `api_service_test.dart`: answers `POST /api/sessions`
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
    if (request.url.path == '/api/policy/preview') {
      return http.Response(
        jsonEncode({'empty': false, 'decision': 'AUTO_ALLOW', 'reason': 'ok'}),
        200,
      );
    }
    return handler(request);
  });
}

void main() {
  group('CheckoutProvider', () {
    test(
      'keeps pending payments from duplicating an order or emptying cart',
      () async {
        var orderCount = 0;
        var captureCalls = 0;
        final api = ApiService(
          baseUrl: 'http://localhost:3000',
          storage: InMemorySessionStorage(),
          client: withSession((request) async {
            if (request.url.path == '/api/orders/create') {
              orderCount++;
              return http.Response(
                jsonEncode({
                  'orderId': 'order-$orderCount',
                  'paypalOrderId': 'paypal-order-$orderCount',
                  'status': 'PAYMENT_PENDING',
                  'origin': 'MANUAL',
                  'totalMinor': 500,
                  'totalFormatted': 'EUR 5.00',
                  'currency': 'EUR',
                  'approvalUrl': 'https://www.sandbox.paypal.com/checkout',
                }),
                200,
              );
            }
            if (request.url.path.endsWith('/capture')) {
              captureCalls++;
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
            if (request.url.path.endsWith('/cancel')) {
              return http.Response(
                jsonEncode({'orderId': 'order-1', 'status': 'ORDER_CANCELLED'}),
                200,
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
        checkout.confirmApprovalInBrowser();
        await checkout.completeCheckout();

        expect(checkout.captured, isNull);
        expect(checkout.paypalApproved, isFalse);
        expect(checkout.hasPendingOrder, isTrue);
        expect(checkout.cart, {'coffee': 1});
        expect(checkout.statusMessage, contains('Approval is not confirmed'));
        expect(captureCalls, 0);

        await checkout.startCheckout();
        expect(orderCount, 1);
        expect(checkout.error, contains('existing PayPal order'));

        expect(
          await checkout.handlePayPalReturn(
            Uri.parse(
              'paypalcommerceagent://checkout/cancel?token=paypal-order-1',
            ),
          ),
          isTrue,
        );
        expect(checkout.hasPendingOrder, isFalse);
        await checkout.startCheckout();
        expect(orderCount, 2);
      },
    );

    test(
      'merges AI and manual items and captures only after PayPal approval',
      () async {
        final capturedRequests = <http.Request>[];
        var createCalls = 0;
        var cleanupCalls = 0;
        final api = ApiService(
          baseUrl: 'http://localhost:3000',
          storage: InMemorySessionStorage(),
          client: withSession((request) async {
            capturedRequests.add(request);
            if (request.url.path == '/api/ai/chat') {
              return http.Response(
                jsonEncode({
                  'sessionId': 'test-session',
                  'response': 'I prepared your breakfast.',
                  'preparedCart': {
                    'items': [
                      {
                        'productId': 'veg_breakfast',
                        'name': 'Vegetarian Breakfast',
                        'quantity': 1,
                        'unitPriceMinor': 1000,
                        'unitPriceFormatted': 'EUR 10.00',
                        'lineTotalMinor': 1000,
                        'lineTotalFormatted': 'EUR 10.00',
                      },
                    ],
                    'totalMinor': 1000,
                    'totalFormatted': 'EUR 10.00',
                    'currency': 'EUR',
                    'message': 'Ready for confirmation.',
                  },
                  'checkoutReady': true,
                  'toolRounds': 2,
                  'messageCount': 2,
                }),
                200,
              );
            }
            if (request.url.path == '/api/orders/create') {
              createCalls++;
              final body = jsonDecode(request.body) as Map<String, dynamic>;
              expect(body['items'], [
                {'productId': 'coffee', 'quantity': 1},
                {'productId': 'veg_breakfast', 'quantity': 3},
              ]);
              return http.Response(
                jsonEncode({
                  'orderId': 'order-1',
                  'paypalOrderId': 'paypal-order-1',
                  'status': 'PAYMENT_PENDING',
                  'origin': 'AI_AGENT',
                  'totalMinor': 3300,
                  'totalFormatted': 'EUR 33.00',
                  'currency': 'EUR',
                  'approvalUrl': 'https://www.sandbox.paypal.com/checkout',
                }),
                200,
              );
            }
            if (request.url.path == '/api/orders/order-1/capture') {
              return http.Response(
                jsonEncode({
                  'orderId': 'order-1',
                  'status': 'PAID',
                  'paypalCaptureId': 'capture-1',
                  'paypalStatus': 'COMPLETED',
                }),
                200,
              );
            }
            if (request.url.path.startsWith('/api/ai/cart/')) {
              cleanupCalls++;
              return http.Response(
                jsonEncode({'error': 'temporary cleanup failure'}),
                503,
              );
            }
            return http.Response('Not found', 404);
          }),
        );
        final chat = ChatProvider(api);
        final launchUrls = <Uri>[];
        final checkout = CheckoutProvider(
          api,
          chat,
          launchApproval: (url) async {
            launchUrls.add(url);
            return true;
          },
        );
        addTearDown(checkout.dispose);
        addTearDown(api.dispose);

        await chat.sendMessage('Vegetarian breakfast for one');
        checkout.addProduct('coffee');
        checkout.setQuantity('veg_breakfast', 3);

        expect(checkout.cart, {'veg_breakfast': 3, 'coffee': 1});

        await checkout.startCheckout();

        expect(checkout.error, isNull, reason: checkout.error);
        expect(launchUrls, isNotEmpty, reason: checkout.error);
        expect(launchUrls.single.scheme, 'https');
        expect(checkout.created?.orderId, 'order-1');
        expect(checkout.paypalApproved, isFalse);

        await checkout.completeCheckout();
        expect(checkout.captured, isNull);
        expect(
          capturedRequests.where(
            (request) => request.url.path.contains('/capture'),
          ),
          isEmpty,
        );

        expect(
          await checkout.handlePayPalReturn(
            Uri.parse(
              'paypalcommerceagent://checkout/success?token=another-order',
            ),
          ),
          isFalse,
        );
        expect(checkout.paypalApproved, isFalse);
        expect(
          await checkout.handlePayPalReturn(
            Uri.parse(
              'paypalcommerceagent://checkout/success?token=paypal-order-1',
            ),
          ),
          isTrue,
        );

        await checkout.completeCheckout();

        expect(checkout.captured?.status, 'PAID');
        expect(checkout.canCheckout, isFalse);
        expect(
          checkout.cart,
          isEmpty,
          reason: 'the cart is cleared after a successful capture',
        );
        expect(chat.lastPreparedCart, isNull,
            reason: 'local AI cart is consumed even when server cleanup fails');
        expect(cleanupCalls, 1);
        expect(createCalls, 1);
        expect(checkout.error, isNotNull,
            reason: 'cleanup failure is shown as a notice, not a retryable cart');
        expect(
          capturedRequests.where(
            (request) => request.url.path.contains('/capture'),
          ),
          hasLength(1),
        );
      },
    );
  });

  group('Sprint A1.2 regression (F2/F3/F4)', () {
    test(
      'F2: PayPal cancel return reaches the backend and preserves the cart',
      () async {
        var cancelCalls = 0;
        final api = ApiService(
          baseUrl: 'http://localhost:3000',
          storage: InMemorySessionStorage(),
          client: withSession((request) async {
            if (request.url.path == '/api/orders/create') {
              return http.Response(
                jsonEncode({
                  'orderId': 'order-1',
                  'paypalOrderId': 'paypal-xyz',
                  'status': 'PAYMENT_PENDING',
                  'origin': 'MANUAL',
                  'totalMinor': 500,
                  'totalFormatted': 'EUR 5.00',
                  'currency': 'EUR',
                  'approvalUrl': 'https://www.sandbox.paypal.com/checkout',
                }),
                200,
              );
            }
            if (request.url.path == '/api/orders/order-1/cancel') {
              cancelCalls++;
              return http.Response(
                jsonEncode({'orderId': 'order-1', 'status': 'ORDER_CANCELLED'}),
                200,
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
        expect(checkout.created?.paypalOrderId, 'paypal-xyz');

        final handled = await checkout.handlePayPalReturn(
          Uri.parse('paypalcommerceagent://checkout/cancel?token=paypal-xyz'),
        );
        expect(handled, isTrue);
        expect(cancelCalls, 1); // backend cancel was actually called
        expect(checkout.created, isNull); // pending order cleared on success
        expect(checkout.cart, {'coffee': 1}); // cart preserved
        expect(checkout.error, isNull);
      },
    );

    test('F2: unrelated/stale cancel link does NOT call the backend', () async {
      var cancelCalls = 0;
      final api = ApiService(
        baseUrl: 'http://localhost:3000',
        storage: InMemorySessionStorage(),
        client: withSession((request) async {
          if (request.url.path == '/api/orders/create') {
            return http.Response(
              jsonEncode({
                'orderId': 'order-1',
                'paypalOrderId': 'paypal-xyz',
                'status': 'PAYMENT_PENDING',
                'origin': 'MANUAL',
                'totalMinor': 500,
                'totalFormatted': 'EUR 5.00',
                'currency': 'EUR',
                'approvalUrl': 'https://www.sandbox.paypal.com/checkout',
              }),
              200,
            );
          }
          if (request.url.path.contains('/cancel')) {
            cancelCalls++;
            return http.Response(
              jsonEncode({'orderId': 'order-1', 'status': 'ORDER_CANCELLED'}),
              200,
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

      final handled = await checkout.handlePayPalReturn(
        Uri.parse('paypalcommerceagent://checkout/cancel?token=wrong-token'),
      );
      // A mismatched token is NOT handled: the UI surfaces the mismatch
      // message and no backend call is made.
      expect(handled, isFalse);
      expect(cancelCalls, 0); // no backend call for a mismatched link
      expect(checkout.created, isNotNull); // pending order preserved
      expect(checkout.error, isNotNull); // user informed
    });

    test('F3: capture 409 ALREADY_CAPTURED reflects paid only when the backend '
        'verified a COMPLETED capture (details.settled == true)', () async {
      final api = ApiService(
        baseUrl: 'http://localhost:3000',
        storage: InMemorySessionStorage(),
        client: withSession((request) async {
          if (request.url.path == '/api/orders/create') {
            return http.Response(
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
          }
          if (request.url.path.contains('/capture')) {
            // Recovery 07.1: a verified, server-settled conflict. The backend
            // only sends `settled: true` after confirming a real PayPal
            // COMPLETED capture (settleFromPayPal), so PAID is justified here.
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
      // Approve via the REAL PayPal return deep link (token matches the pending
      // paypalOrderId). The insecure "I already approved" browser fallback no
      // longer authorizes capture (RECOVERY-02), so a test that wants to reach
      // capture must drive the genuine approval path.
      final approved = await checkout.handlePayPalReturn(
        Uri.parse('paypalcommerceagent://checkout/success?token=paypal-1'),
      );
      expect(approved, isTrue);
      expect(checkout.paypalApproved, isTrue);

      await checkout.completeCheckout();
      // Definitive + verified: the order is paid, not a generic failure.
      expect(checkout.captured?.status, 'PAID');
      expect(checkout.created, isNull);
      expect(checkout.error, isNull);
      expect(
        checkout.cart,
        isEmpty,
        reason: 'the cart is cleared after trusted settled recovery',
      );
    });

    test('F4: the idempotency key is stable across the 401 retry', () async {
      final capturedKeys = <String>[];
      var createCalls = 0;
      final api = ApiService(
        baseUrl: 'http://localhost:3000',
        storage: InMemorySessionStorage(),
        client: withSession((request) async {
          if (request.url.path == '/api/orders/create') {
            createCalls++;
            capturedKeys.add(request.headers['idempotency-key'] ?? '');
            // Force a 401 on the first attempt to exercise the transport retry
            // inside ApiService; the SAME key must be sent on the retry.
            if (createCalls == 1) {
              return http.Response('unauthorized', 401);
            }
            return http.Response(
              jsonEncode({
                'orderId': 'order-$createCalls',
                'paypalOrderId': 'paypal-$createCalls',
                'status': 'PAYMENT_PENDING',
                'origin': 'MANUAL',
                'totalMinor': 500,
                'totalFormatted': 'EUR 5.00',
                'currency': 'EUR',
                'approvalUrl': 'https://www.sandbox.paypal.com/checkout',
              }),
              200,
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
      // Retry happened (401 + refresh), but the key was reused.
      expect(createCalls, 2);
      expect(capturedKeys[0], isNotEmpty);
      expect(capturedKeys[0], capturedKeys[1]);
    });
    test('F4: reuses the key after an ambiguous create failure and rotates for a changed cart', () async {
      final keys = <String>[];
      var createCalls = 0;
      final api = ApiService(
        baseUrl: 'http://localhost:3000',
        storage: InMemorySessionStorage(),
        client: withSession((request) async {
          if (request.url.path == '/api/orders/create') {
            createCalls++;
            keys.add(request.headers['idempotency-key'] ?? '');
            if (createCalls <= 2) return http.Response('upstream timeout', 502);
            return http.Response(
              jsonEncode({
                'orderId': 'order-3',
                'paypalOrderId': 'paypal-3',
                'status': 'PAYMENT_PENDING',
                'origin': 'MANUAL',
                'totalMinor': 500,
                'totalFormatted': 'EUR 5.00',
                'currency': 'EUR',
                'approvalUrl': 'https://www.sandbox.paypal.com/checkout',
              }),
              201,
            );
          }
          return http.Response('Not found', 404);
        }),
      );
      final chat = ChatProvider(api);
      final checkout = CheckoutProvider(api, chat, launchApproval: (_) async => true);
      addTearDown(checkout.dispose);
      addTearDown(api.dispose);

      checkout.addProduct('coffee');
      await checkout.startCheckout();
      await checkout.startCheckout();
      expect(keys, hasLength(2));
      expect(keys[0], isNotEmpty);
      expect(keys[1], keys[0]);

      checkout.addProduct('latte');
      await checkout.startCheckout();
      expect(keys, hasLength(3));
      expect(keys[2], isNot(keys[0]));
      expect(checkout.created?.orderId, 'order-3');
    });

    test('cold PayPal success return recovers the matching pending order before capture', () async {
      var recoveryCalls = 0;
      var captureCalls = 0;
      final api = ApiService(
        baseUrl: 'http://localhost:3000',
        storage: InMemorySessionStorage(),
        client: withSession((request) async {
          if (request.url.path == '/api/orders/pending') {
            recoveryCalls++;
            expect(request.url.queryParameters['token'], 'paypal-recovered-1');
            return http.Response(
              jsonEncode({
                'orderId': 'order-recovered-1',
                'paypalOrderId': 'paypal-recovered-1',
                'status': 'PAYMENT_PENDING',
                'origin': 'MANUAL',
                'totalMinor': 500,
                'totalFormatted': 'EUR 5.00',
                'currency': 'EUR',
                'approvalUrl': null,
              }),
              200,
            );
          }
          if (request.url.path == '/api/orders/order-recovered-1/capture') {
            captureCalls++;
            return http.Response(
              jsonEncode({
                'orderId': 'order-recovered-1',
                'status': 'PAID',
                'paypalCaptureId': 'capture-recovered-1',
                'paypalStatus': 'COMPLETED',
              }),
              200,
            );
          }
          return http.Response('Not found', 404);
        }),
      );
      final chat = ChatProvider(api);
      final checkout = CheckoutProvider(api, chat, launchApproval: (_) async => true);
      addTearDown(checkout.dispose);
      addTearDown(api.dispose);

      final handled = await checkout.handlePayPalReturn(Uri.parse(
        'paypalcommerceagent://checkout/success?token=paypal-recovered-1',
      ));
      expect(handled, isTrue);
      expect(recoveryCalls, 1);
      expect(checkout.created?.orderId, 'order-recovered-1');
      expect(checkout.paypalApproved, isTrue);

      await checkout.completeCheckout();
      expect(captureCalls, 1);
      expect(checkout.captured?.status, 'PAID');
    });

    test('verified already-paid cancel conflict consumes the cart', () async {
      var createCalls = 0;
      final api = ApiService(
        baseUrl: 'http://localhost:3000',
        storage: InMemorySessionStorage(),
        client: withSession((request) async {
          if (request.url.path == '/api/orders/create') {
            createCalls++;
            return http.Response(
              jsonEncode({
                'orderId': 'order-paid-1',
                'paypalOrderId': 'paypal-paid-1',
                'status': 'PAYMENT_PENDING',
                'origin': 'MANUAL',
                'totalMinor': 500,
                'totalFormatted': 'EUR 5.00',
                'currency': 'EUR',
                'approvalUrl': 'https://www.sandbox.paypal.com/checkout',
              }),
              201,
            );
          }
          if (request.url.path == '/api/orders/order-paid-1/cancel') {
            return http.Response(
              jsonEncode({'error': 'Order already captured', 'details': {'settled': true}}),
              409,
            );
          }
          return http.Response('Not found', 404);
        }),
      );
      final chat = ChatProvider(api);
      final checkout = CheckoutProvider(api, chat, launchApproval: (_) async => true);
      addTearDown(checkout.dispose);
      addTearDown(api.dispose);

      checkout.addProduct('coffee');
      await checkout.startCheckout();
      await checkout.cancelCheckout();
      expect(checkout.captured?.status, 'PAID');
      expect(checkout.cart, isEmpty);
      await checkout.startCheckout();
      expect(createCalls, 1);
    });


  });
}
