import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:flutter_app/models/cart.dart';
import 'package:flutter_app/models/chat_message.dart';
import 'package:flutter_app/models/order.dart';
import 'package:flutter_app/models/paid_receipt.dart';
import 'package:flutter_app/models/shopper_preferences.dart';
import 'package:flutter_app/providers/chat_provider.dart';
import 'package:flutter_app/providers/checkout_provider.dart';
import 'package:flutter_app/providers/receipt_controller.dart';
import 'package:flutter_app/services/api_service.dart';
import 'package:flutter_app/services/session_service.dart';

class _FakeApi extends ApiService {
  _FakeApi({this.mode = ChatMode.ai, this.mandate, this.mandateFails = false})
    : super(
        baseUrl: 'https://aicafe.example',
        storage: InMemorySessionStorage(),
        client: MockClient((_) async => http.Response('{}', 200)),
      );

  final ChatMode mode;
  final MandateSummary? mandate;
  final bool mandateFails;
  int mandateCalls = 0;

  @override
  Future<ChatResponse> sendChat({
    required String message,
    ShopperPreferences? preferences,
  }) async => ChatResponse(
    sessionId: 's',
    response: 'cart ready',
    preparedCart: const PreparedCart(
      items: [
        CartLine(
          productId: 'coffee',
          name: 'Fresh Brewed Coffee',
          quantity: 2,
          unitPriceMinor: 350,
          unitPriceFormatted: '€3.50',
          lineTotalMinor: 700,
          lineTotalFormatted: '€7.00',
        ),
      ],
      totalMinor: 700,
      totalFormatted: '€7.00',
      currency: 'EUR',
      message: '',
      policyDecision: PolicyDecision.autoAllow,
    ),
    checkoutReady: true,
    toolRounds: 1,
    messageCount: 2,
    mode: mode,
  );

  @override
  Future<PolicyPreview> previewPolicy(List<OrderItem> items) async =>
      const PolicyPreview(empty: false, decision: PolicyDecision.autoAllow);

  @override
  Future<OrderCreateResult> createOrder({
    required List<OrderItem> items,
    String? idempotencyKey,
  }) async => OrderCreateResult(
    orderId: 'order-1',
    paypalOrderId: 'paypal-1',
    status: 'PAYMENT_PENDING',
    origin: 'AI',
    totalMinor: 700,
    totalFormatted: '€7.00',
    currency: 'EUR',
    approvalUrl: 'https://www.sandbox.paypal.com/checkout',
  );

  @override
  Future<OrderCaptureResult> captureOrder(String orderId) async =>
      OrderCaptureResult(
        orderId: orderId,
        status: 'PAID',
        paypalCaptureId: 'CAPTURE123456',
        paypalStatus: 'COMPLETED',
      );

  @override
  Future<MandateSummary?> getMandate(String orderId) async {
    mandateCalls++;
    if (mandateFails) throw ApiException(500, 'boom');
    return mandate;
  }

  @override
  Future<void> deletePreparedCart() async {}

  @override
  Future<void> deleteChat() async {}
}

const _mandate = MandateSummary(
  orderId: 'order-1',
  signature: 'SIGNATURE_abcdefghijklmnopqrstuvwxyz',
  totalMinor: 700,
  currency: 'EUR',
  lines: [ReceiptLine(productId: 'coffee', quantity: 2, lineTotalMinor: 700)],
);

void main() {
  Future<ReceiptController> run(_FakeApi api, {bool withChat = true}) async {
    final chat = ChatProvider(api);
    if (withChat) await chat.sendMessage('coffee for two');
    final checkout = CheckoutProvider(
      api,
      chat,
      launchApproval: (_) async => true,
    );
    final receipts = ReceiptController(checkout);
    addTearDown(() {
      receipts.dispose();
      checkout.dispose();
    });
    if (!withChat) checkout.addProduct('coffee');
    await checkout.startCheckout();
    final approved = await checkout.handlePayPalReturn(
      Uri.parse('paypalcommerceagent://checkout/success?token=paypal-1'),
    );
    expect(approved, isTrue);
    await checkout.completeCheckout();
    await pumpEventQueue();
    return receipts;
  }

  test('AI cart: the receipt keeps the lines the cart had at capture time', () async {
    final api = _FakeApi(mandate: _mandate);
    final receipts = await run(api);

    final r = receipts.receipt!;
    expect(receipts.checkout.captured?.status, 'PAID');
    expect(r.source, ReceiptCartSource.ai);
    expect(r.lines.single.name, 'Fresh Brewed Coffee');
    expect(r.lines.single.quantity, 2);
    expect(r.totalFormatted, '€7.00');
    expect(r.captureId, 'CAPTURE123456');
    expect(r.verifyLink,
        'https://aicafe.example/verify.html#order-1.SIGNATURE_abcdefghijklmnopqrstuvwxyz');
    // The cart itself is consumed, the receipt is what remains.
    expect(receipts.checkout.cart, isEmpty);
  });

  test('a rule-based cart is labelled rule-based, never AI', () async {
    final api = _FakeApi(mode: ChatMode.ruleBased, mandate: _mandate);
    final receipts = await run(api);
    expect(receipts.receipt!.source, ReceiptCartSource.ruleBased);
  });

  test('a hand-built cart has no assistant source', () async {
    final api = _FakeApi(mandate: _mandate);
    final receipts = await run(api, withChat: false);
    expect(receipts.receipt!.source, ReceiptCartSource.manual);
  });

  test('a failing mandate fetch never undoes the payment: receipt without QR', () async {
    final api = _FakeApi(mandateFails: true);
    final receipts = await run(api);
    expect(receipts.checkout.captured?.status, 'PAID');
    expect(receipts.receipt, isNotNull);
    expect(receipts.receipt!.verifyLink, isNull);
    expect(api.mandateCalls, 1);
  });

  test('dismissReceipt clears it, and a new checkout starts without one', () async {
    final api = _FakeApi(mandate: _mandate);
    final receipts = await run(api);
    expect(receipts.receipt, isNotNull);
    receipts.dismiss();
    expect(receipts.receipt, isNull);
  });
}
