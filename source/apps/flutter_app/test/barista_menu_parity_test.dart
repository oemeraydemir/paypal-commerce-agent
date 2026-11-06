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
import 'package:flutter_app/widgets/brand_mark.dart';
import 'package:flutter_app/widgets/coco_cup_painter.dart';

/// Offline catalogue covering every one-tap web scenario, so the Barista menu
/// parity tests exercise the real filter/render code without a network.
class _MenuFakeApi extends ApiService {
  _MenuFakeApi()
      : super(
          baseUrl: 'https://aicafe.example',
          storage: InMemorySessionStorage(),
          client: MockClient((request) async {
            const jsonHeaders = {
              'content-type': 'application/json; charset=utf-8',
            };
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
          category: 'drinks',
          tags: [], dietary: [], occasion: [], available: true,
        ),
        Product(
          id: 'veg_breakfast',
          name: 'Vegetarian Breakfast',
          description: '',
          priceMinor: 1000,
          currency: 'EUR',
          category: 'breakfast',
          tags: [], dietary: [], occasion: [], available: true,
        ),
        Product(
          id: 'premium_cake',
          name: 'Premium Chocolate Cake',
          description: '',
          priceMinor: 4500,
          currency: 'EUR',
          category: 'desserts',
          tags: [], dietary: [], occasion: [], available: true,
        ),
        Product(
          id: 'office_pastry_box',
          name: 'Office Pastry Box',
          description: '',
          priceMinor: 6000,
          currency: 'EUR',
          category: 'catering',
          tags: [], dietary: [], occasion: [], available: true,
        ),
        Product(
          id: 'mulled_wine',
          name: 'Mulled Wine',
          description: '',
          priceMinor: 700,
          currency: 'EUR',
          category: 'drinks',
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
          items: [],
          totalMinor: 0,
          totalFormatted: '€0.00',
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
  Future<MandateSummary?> getMandate(String orderId) async => null;

  @override
  Future<void> deletePreparedCart() async {}

  @override
  Future<void> deleteChat() async {}
}

Future<CheckoutProvider> _pump(
  WidgetTester tester, {
  String language = 'en',
}) async {
  SharedPreferences.setMockInitialValues({'aicafe.onboarded': true});
  final api = _MenuFakeApi();
  final chat = ChatProvider(api);
  final checkout = CheckoutProvider(
    api,
    chat,
    launchApproval: (_) async => true,
  );

  await tester.pumpWidget(
    MultiProvider(
      providers: [
        Provider<ApiService>.value(value: api),
        ChangeNotifierProvider<LocaleProvider>.value(
          value: LocaleProvider(language),
        ),
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
  await tester.tap(find.text(language == 'tr' ? 'Barista' : 'Barista'));
  await tester.pumpAndSettle();
  return checkout;
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
  });

  testWidgets('Barista shows the menu, filters, scenarios and 3 prompt chips',
      (tester) async {
    tester.view.physicalSize = const Size(360, 740);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    final handle = tester.ensureSemantics();

    await _pump(tester);

    expect(find.byKey(const Key('barista-menu')), findsOneWidget);
    expect(find.byKey(const Key('barista-menu-list')), findsOneWidget);
    expect(find.byKey(const Key('barista-menu-coffee')), findsOneWidget);
    expect(find.byKey(const Key('barista-category-all')), findsOneWidget);
    expect(find.byKey(const Key('barista-category-drinks')), findsOneWidget);
    expect(find.byKey(const Key('barista-category-breakfast')), findsOneWidget);
    expect(find.byKey(const Key('welcome-chip3')), findsOneWidget);
    expect(
      find.byKey(const Key('barista-scenario-scenario.quick')),
      findsOneWidget,
    );
    expect(
      find.byKey(const Key('barista-scenario-scenario.alcohol')),
      findsOneWidget,
    );
    // The menu stays reachable after the chat fills with messages.
    expect(find.byKey(const Key('barista-open-menu')), findsOneWidget);

    // Clean Coco outline mark instead of the old stacked filled icon + dot.
    expect(find.bySemanticsLabel('AI Café Coco logo'), findsWidgets);
    handle.dispose();
    expect(find.byType(BrandMark), findsWidgets);
    expect(find.byWidgetPredicate(
      (w) => w is CustomPaint && w.painter is CocoCupPainter,
    ), findsWidgets);
  });

  testWidgets('category filter narrows the Barista menu', (tester) async {
    tester.view.physicalSize = const Size(360, 740);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await _pump(tester);
    final dessertChip =
        find.byKey(const Key('barista-category-desserts'));
    await tester.ensureVisible(dessertChip);
    await tester.pumpAndSettle();
    await tester.tap(dessertChip);
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('barista-menu-premium_cake')), findsOneWidget);
    expect(find.byKey(const Key('barista-menu-coffee')), findsNothing);
  });

  testWidgets('a one-tap scenario stages the cart but never creates an order',
      (tester) async {
    tester.view.physicalSize = const Size(360, 740);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final checkout = await _pump(tester);
    expect(checkout.cart, isEmpty);

    final quickScenario =
        find.byKey(const Key('barista-scenario-scenario.quick'));
    await tester.ensureVisible(quickScenario);
    await tester.pumpAndSettle();
    await tester.tap(quickScenario);
    await tester.pumpAndSettle();

    expect(checkout.cart, {'coffee': 1});
    expect(checkout.created, isNull, reason: 'no PayPal order may be created');
    expect(checkout.captured, isNull);
    expect(find.byKey(const Key('cart-checkout')), findsOneWidget);
  });

  testWidgets('Turkish Barista menu renders without a pixel overflow',
      (tester) async {
    tester.view.physicalSize = const Size(360, 740);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await _pump(tester, language: 'tr');

    expect(find.byKey(const Key('barista-menu')), findsOneWidget);
    expect(find.text('Menü'), findsWidgets);
    expect(find.text('Bir senaryo dene'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
