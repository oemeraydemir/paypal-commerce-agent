import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:flutter_app/l10n/app_strings.dart';
import 'package:flutter_app/providers/chat_provider.dart';
import 'package:flutter_app/providers/checkout_provider.dart';
import 'package:flutter_app/providers/locale_provider.dart';
import 'package:flutter_app/providers/shopper_profile_provider.dart';
import 'package:flutter_app/screens/chat_screen.dart';
import 'package:flutter_app/services/api_service.dart';
import 'package:flutter_app/services/session_service.dart';

/// Same hollow backend used by the chat-screen regression tests: no network,
/// no session, an empty catalogue (the cart sheet falls back to placeholders).
class _HollowApi extends ApiService {
  _HollowApi()
      : super(
          baseUrl: 'http://test',
          storage: InMemorySessionStorage(),
          client: MockClient((request) async {
            const jsonHeaders = {
              'content-type': 'application/json; charset=utf-8',
            };
            if (request.url.path == '/api/health') {
              return http.Response(
                '{"status":"ok","paypal":{"enabled":false,"environment":"sandbox"},"ai":{"enabled":false}}',
                200,
                headers: jsonHeaders,
              );
            }
            if (request.url.path == '/api/catalog') {
              return http.Response('{"count":0,"products":[]}', 200,
                  headers: jsonHeaders);
            }
            return http.Response('{}', 200, headers: jsonHeaders);
          }),
        );
}

/// Pumps the real [ChatScreen] with the same provider/localization shape as
/// MyApp, then opens the cart bottom sheet through the Cart nav destination.
Future<void> _pumpCartSheet(
  WidgetTester tester,
  String language, {
  int itemCount = 0,
}) async {
  // Skip the first-run onboarding dialog: it would cover the bottom nav and
  // swallow the tap on the Cart destination.
  SharedPreferences.setMockInitialValues({'aicafe.onboarded': true});

  final api = _HollowApi();
  final localeProvider = LocaleProvider(language);
  final chatProvider = ChatProvider(api);
  final checkoutProvider = CheckoutProvider(api, chatProvider);
  for (var i = 0; i < itemCount; i++) {
    checkoutProvider.setQuantity('manual-item-$i', 1);
  }

  await tester.pumpWidget(
    MultiProvider(
      providers: [
        Provider<ApiService>.value(value: api),
        ChangeNotifierProvider<LocaleProvider>.value(value: localeProvider),
        ChangeNotifierProvider<ChatProvider>.value(value: chatProvider),
        ChangeNotifierProvider<ShopperProfileProvider>(
          create: (_) => ShopperProfileProvider(),
        ),
        ChangeNotifierProxyProvider<ChatProvider, CheckoutProvider>(
          create: (_) => checkoutProvider,
          update: (_, _, previous) => previous ?? checkoutProvider,
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
  await tester.pump();
  await tester.tap(find.byIcon(Icons.shopping_bag_outlined));
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
  });

  for (final language in const ['en', 'tr']) {
    testWidgets(
        'cart sheet ($language) is scrollable and keeps both actions aligned',
        (tester) async {
      // 360dp is narrow enough that "Checkout with PayPal" / "PayPal ile
      // ödeme" used to wrap onto two lines while the clear label did not:
      // the device UI dump showed 42dp vs 56dp buttons, vertically offset.
      tester.view.physicalSize = const Size(360, 740);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await _pumpCartSheet(tester, language);

      final clear = find.byKey(const Key('cart-clear'));
      final checkout = find.byKey(const Key('cart-checkout'));
      expect(clear, findsOneWidget);
      expect(checkout, findsOneWidget);

      // Before the fix the sheet was a plain, non-scrolling Column. A cart
      // with several rows / passport / take-home ideas overflowed the bottom
      // with "A RenderFlex overflowed by N pixels".
      expect(
        find.ancestor(
          of: checkout,
          matching: find.byType(SingleChildScrollView),
        ),
        findsOneWidget,
      );

      // Both buttons now share one fixed height and one top edge.
      final clearRect = tester.getRect(clear);
      final checkoutRect = tester.getRect(checkout);
      expect((clearRect.height - checkoutRect.height).abs(), lessThan(0.5));
      expect((clearRect.top - checkoutRect.top).abs(), lessThan(0.5));

      // The clear action is a cart action, not a chat action.
      expect(find.text(AppStrings.get(language, 'cart.clear')), findsOneWidget);
      expect(find.text('Clear conversation'), findsNothing);

      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('a tall cart does not overflow the sheet vertically',
      (tester) async {
    // 12 rows + subtotal + policy + take-home card + three button rows is far
    // taller than a 740dp viewport. The old non-scrolling Column reported
    // "A RenderFlex overflowed by N pixels on the bottom" and clipped the
    // buttons; the scrollable, height-capped sheet must stay clean.
    tester.view.physicalSize = const Size(360, 740);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await _pumpCartSheet(tester, 'en', itemCount: 12);

    expect(find.byKey(const Key('cart-checkout')), findsOneWidget);
    // ChatScreen itself renders an extra ListTile on the home view, so assert
    // "at least the 12 cart rows" rather than an exact global count.
    expect(find.byType(ListTile), findsAtLeastNWidgets(12));
    expect(tester.takeException(), isNull);
  });
}
