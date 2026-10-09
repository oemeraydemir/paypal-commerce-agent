import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/providers/chat_provider.dart';
import 'package:flutter_app/providers/checkout_provider.dart';
import 'package:flutter_app/services/api_service.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  group('CheckoutProvider', () {
    test(
      'keeps pending payments from duplicating an order or emptying cart',
      () async {
        var orderCount = 0;
        final api = ApiService(
          baseUrl: 'http://localhost:3000',
          client: MockClient((request) async {
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
        expect(checkout.hasPendingOrder, isTrue);
        expect(checkout.cart, {'coffee': 1});

        await checkout.startCheckout();
        expect(orderCount, 1);
        expect(checkout.error, contains('existing PayPal order'));

        expect(
          checkout.handlePayPalReturn(
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
        final api = ApiService(
          baseUrl: 'http://localhost:3000',
          client: MockClient((request) async {
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
              final body = jsonDecode(request.body) as Map<String, dynamic>;
              expect(body['items'], [
                {'id': 'coffee', 'quantity': 1},
                {'id': 'veg_breakfast', 'quantity': 3},
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
              return http.Response(
                jsonEncode({'message': 'AI-prepared cart cleared'}),
                200,
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
          checkout.handlePayPalReturn(
            Uri.parse(
              'paypalcommerceagent://checkout/success?token=another-order',
            ),
          ),
          isFalse,
        );
        expect(checkout.paypalApproved, isFalse);
        expect(
          checkout.handlePayPalReturn(
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
          capturedRequests.where(
            (request) => request.url.path.contains('/capture'),
          ),
          hasLength(1),
        );
      },
    );
  });
}
