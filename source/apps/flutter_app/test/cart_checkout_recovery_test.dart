import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:flutter_app/models/cart.dart';
import 'package:flutter_app/models/chat_message.dart';
import 'package:flutter_app/models/order.dart';
import 'package:flutter_app/models/paid_receipt.dart';
import 'package:flutter_app/models/product.dart';
import 'package:flutter_app/models/shopper_preferences.dart';
import 'package:flutter_app/providers/chat_provider.dart';
import 'package:flutter_app/providers/checkout_provider.dart';
import 'package:flutter_app/providers/locale_provider.dart';
import 'package:flutter_app/providers/shopper_profile_provider.dart';
import 'package:flutter_app/screens/chat_screen.dart';
import 'package:flutter_app/services/api_service.dart';
import 'package:flutter_app/services/session_service.dart';
import 'package:flutter_app/widgets/paid_receipt_card.dart';

/// Offline backend with a real (small) catalogue and a deterministic,
/// auto-allowing policy verdict. No network, no credentials, no session.
class _FakeApi extends ApiService {
  _FakeApi()
      : super(
          baseUrl: 'https://aicafe.example',
          storage: InMemorySessionStorage(),
          client: MockClient((request) async {
            const jsonHeaders = {
              'content-type': 'application/json; charset=utf-8',
            };
            if (request.url.path == '/api/catalog') {
              return http.Response(
                '{"count":2,"products":['
                '{"id":"coffee","name":"Fresh Brewed Coffee","priceMinor":350,"currency":"EUR","available":true},'
                '{"id":"pancakes","name":"Fluffy Pancakes","priceMinor":900,"currency":"EUR","available":true}'
                ']}',
                200,
                headers: jsonHeaders,
              );
            }
            if (request.url.path == '/api/health') {
              return http.Response(
                '{"status":"ok","paypal":{"enabled":true,"environment":"sandbox"},"ai":{"enabled":true}}',
                200,
                headers: jsonHeaders,
              );
            }
            return http.Response('{}', 200, headers: jsonHeaders);
          }),
        );

  @override
  Future<List<Product>> getCatalog() async => const [
        Product(
          id: 'coffee',
          name: 'Fresh Brewed Coffee',
          description: '',
          priceMinor: 350,
          currency: 'EUR',
          category: 'drink',
          tags: [], dietary: [], occasion: [], available: true,
        ),
        Product(
          id: 'pancakes',
          name: 'Fluffy Pancakes',
          description: '',
          priceMinor: 900,
          currency: 'EUR',
          category: 'food',
          tags: [], dietary: [], occasion: [], available: true,
        ),
      ];

  @override
  Future<PolicyPreview> previewPolicy(List<OrderItem> items) async =>
      const PolicyPreview(empty: false, decision: PolicyDecision.autoAllow);

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
              quantity: 1,
              unitPriceMinor: 350,
              unitPriceFormatted: '€3.50',
              lineTotalMinor: 350,
              lineTotalFormatted: '€3.50',
            ),
          ],
          totalMinor: 350,
          totalFormatted: '€3.50',
          currency: 'EUR',
          message: '',
          policyDecision: PolicyDecision.autoAllow,
        ),
        checkoutReady: true,
        toolRounds: 1,
        messageCount: 2,
        mode: ChatMode.ai,
      );

  @override
  Future<OrderCreateResult> createOrder({
    required List<OrderItem> items,
    String? idempotencyKey,
    Map<String, dynamic>? wellbeingPreferences,
  }) async =>
      OrderCreateResult(
        orderId: 'order-1',
        paypalOrderId: 'paypal-1',
        status: 'PAYMENT_PENDING',
        origin: 'AI',
        totalMinor: 350,
        totalFormatted: '€3.50',
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
  Future<OrderCancelResult> cancelOrder(String orderId) async =>
      const OrderCancelResult(orderId: 'order-1', status: 'CANCELLED');

  @override
  Future<MandateSummary?> getMandate(String orderId) async => const MandateSummary(
        orderId: 'order-1',
        signature: 'SIGNATURE_abcdefghijklmnopqrstuvwxyz',
        totalMinor: 350,
        currency: 'EUR',
        lines: [
          ReceiptLine(productId: 'coffee', quantity: 1, lineTotalMinor: 350),
        ],
      );

  @override
  Future<void> deletePreparedCart() async {}

  @override
  Future<void> deleteChat() async {}
}

Future<CheckoutProvider> _pumpChatScreen(
  WidgetTester tester, {
  bool withReceipt = false,
  bool withPendingOrder = false,
}) async {
  SharedPreferences.setMockInitialValues({'aicafe.onboarded': true});
  final api = _FakeApi();
  final chat = ChatProvider(api);
  final checkout = CheckoutProvider(
    api,
    chat,
    launchApproval: (_) async => true,
  );
  // The provider is owned (and disposed) by ChangeNotifierProxyProvider.
  // Add items through the manual cart so the Barista conversation can start
  // empty — the exact surface that must stay free of payment controls.
  if (withPendingOrder) {
    checkout.addProduct('coffee');
    await checkout.startCheckout();
  }
  if (withReceipt) {
    await chat.sendMessage('coffee');
    await checkout.startCheckout();
    await checkout.handlePayPalReturn(
      Uri.parse('paypalcommerceagent://checkout/success?token=paypal-1'),
    );
    await checkout.completeCheckout();
  }

  await tester.pumpWidget(
    MultiProvider(
      providers: [
        Provider<ApiService>.value(value: api),
        ChangeNotifierProvider<LocaleProvider>.value(value: LocaleProvider('en')),
        ChangeNotifierProvider<ChatProvider>.value(value: chat),
        ChangeNotifierProvider<ShopperProfileProvider>(
          create: (_) => ShopperProfileProvider(),
        ),
        ChangeNotifierProxyProvider<ChatProvider, CheckoutProvider>(
          create: (_) => checkout,
          update: (_, _, previous) => previous ?? checkout,
        ),
      ],
      child: Consumer<LocaleProvider>(
        builder: (_, locale, _) => MaterialApp(
          locale: locale.locale,
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
          ],
          supportedLocales: const [Locale('en', 'IE'), Locale('tr', 'TR')],
          home: const ChatScreen(),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return checkout;
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
  });

  testWidgets(
    'an empty cart points to Home/Barista (no food chips) and checkout enables once items exist',
    (tester) async {
      tester.view.physicalSize = const Size(360, 740);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      final checkout = await _pumpChatScreen(tester);
      expect(checkout.cart, isEmpty);

      await tester.tap(find.byIcon(Icons.shopping_bag_outlined));
      await tester.pumpAndSettle();

      // Web parity: the Cart tab never asks what to order. Adding food is a
      // Home / Barista job, so the empty state only links there.
      expect(find.byKey(const Key('cart-quick-add-coffee')), findsNothing);
      expect(find.byKey(const Key('cart-quick-add-pancakes')), findsNothing);
      expect(find.byKey(const Key('cart-browse-menu')), findsOneWidget);
      expect(find.byKey(const Key('cart-ask-barista')), findsOneWidget);

      final checkoutButton = find.byKey(const Key('cart-checkout'));
      expect(
        tester.widget<ButtonStyleButton>(checkoutButton).onPressed,
        isNull,
        reason: 'checkout must stay disabled while the cart is empty',
      );

      checkout.addProduct('coffee');
      await tester.pumpAndSettle();

      expect(checkout.cart['coffee'], 1);
      expect(find.text('Fresh Brewed Coffee'), findsOneWidget);
      expect(find.byKey(const Key('cart-browse-menu')), findsNothing);
      expect(
        tester.widget<ButtonStyleButton>(checkoutButton).onPressed,
        isNotNull,
        reason: 'a non-empty, policy-allowed cart must enable PayPal checkout',
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('the empty-cart buttons switch to the Barista tab',
      (tester) async {
    tester.view.physicalSize = const Size(360, 740);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await _pumpChatScreen(tester);
    await tester.tap(find.byIcon(Icons.shopping_bag_outlined));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('cart-ask-barista')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('cart-checkout')), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a paid receipt lives on the Cart tab and never in Barista',
      (tester) async {
    tester.view.physicalSize = const Size(360, 740);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final checkout = await _pumpChatScreen(tester, withReceipt: true);
    expect(checkout.receipt, isNotNull);

    // Web parity: Barista is the conversation only.
    await tester.tap(find.text('Barista'));
    await tester.pumpAndSettle();
    expect(find.byType(PaidReceiptCard), findsNothing);

    // The receipt is shown with the cart, and must not overflow the screen.
    await tester.tap(find.byIcon(Icons.shopping_bag_outlined));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byType(PaidReceiptCard),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.byType(PaidReceiptCard), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'PayPal approval status shows on the Cart tab, not in Barista',
    (tester) async {
      tester.view.physicalSize = const Size(360, 740);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      final checkout = await _pumpChatScreen(tester, withPendingOrder: true);
      expect(checkout.hasPendingOrder, isTrue);

      // Barista: no payment page, no "check server status", no cancel control,
      // no "Open PayPal" strip.
      await tester.tap(find.text('Barista'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('checkout-check-status')), findsNothing);
      expect(find.byKey(const Key('checkout-cancel-order')), findsNothing);
      expect(find.text('Check server status'), findsNothing);
      expect(find.text('Cancel this PayPal order'), findsNothing);
      expect(find.text('Open PayPal'), findsNothing);
      expect(tester.takeException(), isNull, reason: 'empty Barista layout');

      // Cart tab: the approval status lives here, next to the cart actions.
      await tester.tap(find.byIcon(Icons.shopping_bag_outlined));
      await tester.pumpAndSettle();
      expect(find.text('Open PayPal'), findsOneWidget);
      expect(find.byKey(const Key('cart-pending-banner')), findsNothing);
      expect(find.byKey(const Key('cart-pending-reconcile')), findsNothing);
      expect(find.byKey(const Key('cart-pending-cancel')), findsNothing);
      expect(find.byKey(const Key('cart-checkout')), findsOneWidget);
      expect(find.byKey(const Key('cart-clear')), findsOneWidget);
      expect(tester.takeException(), isNull, reason: 'cart tab layout');
    },
  );
}
