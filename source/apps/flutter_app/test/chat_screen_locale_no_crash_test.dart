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

/// A hollow [ApiService] that answers the two calls [ChatScreen] makes on
/// startup (`/api/health`, `/api/catalog`) with valid, empty payloads. No real
/// network is touched; no session is required for either endpoint.
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

/// Pumps the real [ChatScreen] under the same localization configuration used by
/// `MyApp` in lib/main.dart (delegates + supportedLocales), with the providers
/// the screen reads. Returns the app under test.
Future<void> _pumpChat(WidgetTester tester, String language) async {
  SharedPreferences.setMockInitialValues({});

  final api = _HollowApi();
  final localeProvider = LocaleProvider(language);
  final chatProvider = ChatProvider(api);
  final checkoutProvider = CheckoutProvider(api, chatProvider);

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
      // Mirrors MyApp in lib/main.dart, which rebuilds MaterialApp from a
      // Consumer<LocaleProvider> when the language changes. Keeping this shape
      // is what makes the regression test below meaningful: MaterialApp does
      // rebuild, but its Navigator keeps the ChatScreen route instance, so the
      // screen only re-localises if it depends on LocaleProvider itself.
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
  // Let the first build and frame post-frame callbacks settle.
  await tester.pump();
}

void main() {
  // Mirrors the startup fix in lib/main.dart: intl date symbols are
  // initialized before any DateFormat is constructed. In production this
  // happens in main() before runApp(); here we do it once before the widgets
  // are pumped.
  setUpAll(() async {
    await initializeDateFormatting();
  });

  testWidgets(
      'ChatScreen first render has no exception in Turkish (tr_TR)',
      (tester) async {
    await _pumpChat(tester, 'tr');

    // The two regressions this guards against:
    //  1. LocaleDataException from DateFormat('HH:mm', 'tr_TR') when intl
    //     date symbols are not initialized (fixed in main()).
    //  2. "No MaterialLocalizations found" from MaterialApp without
    //     localizationsDelegates for a non-English locale (fixed in main()).
    expect(tester.takeException(), isNull);
    expect(find.text('AI Café'), findsOneWidget);
  });

  testWidgets(
      'ChatScreen first render has no exception in English (en_IE)',
      (tester) async {
    await _pumpChat(tester, 'en');

    expect(tester.takeException(), isNull);
    expect(find.text('AI Café'), findsOneWidget);
  });

  testWidgets('timeFormat is usable for both supported locales after init',
      (tester) async {
    // Direct check of the exact formatting call used in the app. This is the
    // pure logic layer; it runs even where the flutter_tester harness cannot.
    final sample = DateTime(2026, 10, 25, 9, 5);
    expect(AppStrings.timeFormat('tr').format(sample), '09:05');
    expect(AppStrings.timeFormat('en').format(sample), '09:05');
  });

  // Regression: switching TR -> EN used to leave the AppBar tooltips, the
  // subtitle and the status chips in the previous language, because ChatScreen
  // read the locale with `listen: false` and is the Navigator's root route (a
  // new MaterialApp locale does not rebuild it). The observed symptom was a
  // half-Turkish / half-English screen.
  testWidgets('switching TR -> EN re-localises the whole chat chrome',
      (tester) async {
    await _pumpChat(tester, 'tr');

    expect(find.byTooltip('Alışveriş profili'), findsOneWidget);
    expect(find.byTooltip('Sohbeti temizle'), findsOneWidget);
    expect(find.byTooltip('Yardım & tanıtım'), findsOneWidget);
    expect(find.byTooltip('Sepet'), findsOneWidget);
    expect(
      find.text('Yapay zeka destekli alışveriş · PayPal sandbox'),
      findsOneWidget,
    );

    // Flip the language the same way the AppBar toggle does.
    final context = tester.element(find.byType(ChatScreen));
    await context.read<LocaleProvider>().setLanguage('en');
    await tester.pumpAndSettle();

    expect(find.byTooltip('Shopping profile'), findsOneWidget);
    expect(find.byTooltip('Clear conversation'), findsOneWidget);
    expect(find.byTooltip('Help & intro'), findsOneWidget);
    expect(find.byTooltip('Cart'), findsOneWidget);
    expect(
      find.text('AI-powered shopping · PayPal sandbox'),
      findsOneWidget,
    );

    // No stale Turkish chrome left behind.
    expect(find.byTooltip('Alışveriş profili'), findsNothing);
    expect(find.byTooltip('Sepet'), findsNothing);
    expect(find.byTooltip('Sohbeti temizle'), findsNothing);
    expect(find.byTooltip('Yardım & tanıtım'), findsNothing);
    expect(
      find.text('Yapay zeka destekli alışveriş · PayPal sandbox'),
      findsNothing,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('switching EN -> TR re-localises the whole chat chrome',
      (tester) async {
    await _pumpChat(tester, 'en');

    expect(find.byTooltip('Shopping profile'), findsOneWidget);

    final context = tester.element(find.byType(ChatScreen));
    await context.read<LocaleProvider>().setLanguage('tr');
    await tester.pumpAndSettle();

    expect(find.byTooltip('Alışveriş profili'), findsOneWidget);
    expect(find.byTooltip('Sepet'), findsOneWidget);
    expect(find.byTooltip('Shopping profile'), findsNothing);
    expect(find.byTooltip('Cart'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
