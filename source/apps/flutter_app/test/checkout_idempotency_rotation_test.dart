import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_app/providers/chat_provider.dart';
import 'package:flutter_app/providers/checkout_provider.dart';
import 'package:flutter_app/services/api_service.dart';
import 'package:flutter_app/services/session_service.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Answers the session + policy calls that CheckoutProvider fires in the
/// background, then delegates the payment calls to the test's handler.
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

Map<String, Object> createBody(int index, {String? orderId}) => {
      'orderId': orderId ?? 'order-$index',
      'paypalOrderId': 'paypal-order-$index',
      'status': 'PAYMENT_PENDING',
      'origin': 'MANUAL',
      'totalMinor': 300,
      'totalFormatted': 'EUR 3.00',
      'currency': 'EUR',
      'approvalUrl': 'https://www.sandbox.paypal.com/checkout',
    };

/// A fake backend that creates a fresh order on every create call (unless the
/// test overrides it) and captures any created order as PAID.
class FakeBackend {
  final List<String> keys = <String>[];
  final List<String> orderIds = <String>[];
  int createCount = 0;
  int captureCount = 0;
  String? Function(int call)? createOverride;

  MockClient get client => withSession((request) async {
        if (request.url.path == '/api/orders/create') {
          createCount++;
          keys.add(request.headers['idempotency-key'] ?? '');
          final overridden = createOverride?.call(createCount);
          final body = overridden != null
              ? createBody(createCount, orderId: overridden)
              : createBody(createCount);
          orderIds.add(body['orderId']! as String);
          return http.Response(jsonEncode(body), 201);
        }
        if (request.url.path.endsWith('/capture')) {
          captureCount++;
          final orderId = request.url.path
              .split('/')
              .elementAt(request.url.path.split('/').length - 2);
          return http.Response(
            jsonEncode({
              'orderId': orderId,
              'status': 'PAID',
              'paypalCaptureId': 'capture-$captureCount',
              'paypalStatus': 'COMPLETED',
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
      });
}

void main() {
  setUpAll(() {
    TestWidgetsFlutterBinding.ensureInitialized();
  });

  setUp(() {
    // Each test starts from a clean "device". setMockInitialValues also resets
    // SharedPreferences' static cache between tests.
    SharedPreferences.setMockInitialValues(<String, Object>{});
  });

  CheckoutProvider buildProvider(ApiService api) {
    final chat = ChatProvider(api);
    final checkout = CheckoutProvider(
      api,
      chat,
      launchApproval: (_) async => true,
    );
    addTearDown(checkout.dispose);
    return checkout;
  }

  ApiService buildApi(FakeBackend backend) {
    final api = ApiService(
      baseUrl: 'http://localhost:3000',
      storage: InMemorySessionStorage(),
      client: backend.client,
    );
    addTearDown(api.dispose);
    return api;
  }

  test('a second checkout of the same cart after payment uses a fresh key',
      () async {
    final backend = FakeBackend();
    final checkout = buildProvider(buildApi(backend));

    checkout.addProduct('coffee');
    await checkout.startCheckout();
    final firstKey = backend.keys.single;

    await checkout.handlePayPalReturn(Uri.parse(
      'paypalcommerceagent://checkout/success?token=paypal-order-1',
    ));
    await checkout.completeCheckout();
    expect(checkout.captured?.status, 'PAID');
    expect(checkout.cart, isEmpty);

    // The shopper adds exactly the same item again: this MUST be a new PayPal
    // order, not an idempotent replay of the already-paid one.
    checkout.addProduct('coffee');
    await checkout.startCheckout();

    expect(backend.keys, hasLength(2));
    expect(backend.keys.last, isNot(firstKey));
    expect(checkout.created?.orderId, 'order-2');
    expect(checkout.created?.status, 'PAYMENT_PENDING');
    expect(checkout.hasPendingOrder, isTrue);
  });

  test('cancelling an order also rotates the key for the next attempt',
      () async {
    final backend = FakeBackend();
    final checkout = buildProvider(buildApi(backend));

    checkout.addProduct('coffee');
    await checkout.startCheckout();
    final firstKey = backend.keys.single;

    await checkout.cancelCheckout();
    expect(checkout.hasPendingOrder, isFalse);
    expect(checkout.cart, {'coffee': 1}, reason: 'cancel preserves the cart');

    await checkout.startCheckout();
    expect(backend.keys, hasLength(2));
    expect(backend.keys.last, isNot(firstKey));
    expect(checkout.created?.orderId, 'order-2');
  });

  test('ambiguous create failures keep the key so a retry deduplicates',
      () async {
    final keys = <String>[];
    var calls = 0;
    final api = ApiService(
      baseUrl: 'http://localhost:3000',
      storage: InMemorySessionStorage(),
      client: withSession((request) async {
        if (request.url.path == '/api/orders/create') {
          calls++;
          keys.add(request.headers['idempotency-key'] ?? '');
          // 5xx is deliberately not cached by the backend idempotency layer.
          if (calls <= 2) return http.Response('upstream timeout', 502);
          return http.Response(jsonEncode(createBody(calls)), 201);
        }
        return http.Response('Not found', 404);
      }),
    );
    addTearDown(api.dispose);
    final checkout = buildProvider(api);

    checkout.addProduct('coffee');
    await checkout.startCheckout();
    await checkout.startCheckout();
    await checkout.startCheckout();

    expect(keys, hasLength(3));
    expect(keys[1], keys[0], reason: 'no rotation after an ambiguous failure');
    expect(keys[2], keys[0], reason: 'the successful retry reuses the key');
    expect(checkout.created?.orderId, 'order-3');
  });

  test('the attempt survives an app restart after a paid order', () async {
    final backend = FakeBackend();

    // Process 1: create + capture.
    final first = buildProvider(buildApi(backend));
    first.addProduct('coffee');
    await first.startCheckout();
    final firstKey = backend.keys.single;
    await first.handlePayPalReturn(Uri.parse(
      'paypalcommerceagent://checkout/success?token=paypal-order-1',
    ));
    await first.completeCheckout();
    expect(first.captured?.status, 'PAID');

    // Process 2: a brand new provider graph (same device storage, same cart).
    final second = buildProvider(buildApi(backend));
    second.addProduct('coffee');
    await second.startCheckout();

    expect(backend.keys, hasLength(2));
    expect(backend.keys.last, isNot(firstKey));
    expect(second.created?.orderId, 'order-2');
  });

  test('a replayed finished order is recovered with one rotated retry',
      () async {
    // Simulates a device whose durable attempt counter was lost but whose
    // last finished order is known: the backend idempotency layer hands back
    // the cached 201 of the already-paid order (still PAYMENT_PENDING).
    SharedPreferences.setMockInitialValues(<String, Object>{
      'aicafe.checkout.lastFinishedOrder': 'order-paid-old',
    });
    final backend = FakeBackend();
    backend.createOverride = (call) => call == 1 ? 'order-paid-old' : null;
    final checkout = buildProvider(buildApi(backend));

    checkout.addProduct('coffee');
    await checkout.startCheckout();

    expect(backend.createCount, 2, reason: 'exactly one rotated retry');
    expect(backend.keys, hasLength(2));
    expect(backend.keys.last, isNot(backend.keys.first));
    expect(checkout.created?.orderId, 'order-2');
    expect(checkout.hasPendingOrder, isTrue);
  });
}
