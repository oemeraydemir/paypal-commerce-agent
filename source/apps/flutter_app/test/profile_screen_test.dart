import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:flutter_app/providers/locale_provider.dart';
import 'package:flutter_app/providers/shopper_profile_provider.dart';
import 'package:flutter_app/screens/profile_screen.dart';
import 'package:flutter_app/services/api_service.dart';
import 'package:flutter_app/services/session_service.dart';

void main() {
  testWidgets(
      'ProfileScreen renders preferences, AI+PayPal guides and the merchant section',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final locale = LocaleProvider('en');
    final profile = ShopperProfileProvider();
    // ProfileScreen embeds ScopesSection, which reads ApiService (and loads the
    // shopper's scopes on init). Provide a mock that returns no scopes.
    final api = ApiService(
      baseUrl: 'http://localhost:3000',
      storage: InMemorySessionStorage(),
      client: MockClient((request) async {
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
        if (request.method == 'GET' &&
            request.url.path == '/api/policy/scopes') {
          return http.Response(jsonEncode({'scopes': <dynamic>[]}), 200);
        }
        return http.Response('{}', 404);
      }),
    );

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<LocaleProvider>.value(value: locale),
          ChangeNotifierProvider<ShopperProfileProvider>.value(value: profile),
          Provider<ApiService>.value(value: api),
        ],
        child: MaterialApp(home: const ProfileScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Your shopping profile'), findsOneWidget);
    expect(find.text('Edit my preferences'), findsOneWidget);

    // ListView builds its children lazily: everything below the viewport is not
    // in the widget tree yet. Scroll each later section into view before
    // asserting its text (otherwise find.text reports 0 widgets).
    await tester.scrollUntilVisible(
      find.text('Use the café better with AI + PayPal'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Use the café better with AI + PayPal'), findsOneWidget);

    // The merchant section renders below the fold; scroll down to it.
    await tester.scrollUntilVisible(
      find.text('For café owners: add PayPal'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('For café owners: add PayPal'), findsOneWidget);
    expect(tester.takeException(), isNull);

    profile.dispose();
    locale.dispose();
  });
}
