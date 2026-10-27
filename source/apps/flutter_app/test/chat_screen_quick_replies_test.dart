import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:flutter_app/providers/chat_provider.dart';
import 'package:flutter_app/providers/checkout_provider.dart';
import 'package:flutter_app/providers/locale_provider.dart';
import 'package:flutter_app/providers/shopper_profile_provider.dart';
import 'package:flutter_app/screens/chat_screen.dart';
import 'package:flutter_app/services/api_service.dart';
import 'package:flutter_app/services/session_service.dart';

const _table = '| Option | Items | Total |\n'
    '| --- | --- | --- |\n'
    '| 1️⃣ Toast | 2 toast | €17 |\n'
    '| 2️⃣ Pancakes | 2 pancakes | €18 |';

ChatResponse _response(String text) => ChatResponse(
      sessionId: 'test-session', response: text, preparedCart: null,
      checkoutReady: false, toolRounds: 0, messageCount: 1,
    );

class _Api extends ApiService {
  final sent = <String>[];
  Completer<ChatResponse>? pending;

  _Api()
      : super(
          baseUrl: 'http://test',
          storage: InMemorySessionStorage(),
          client: MockClient((request) async {
            const headers = {'content-type': 'application/json'};
            if (request.url.path == '/api/health') {
              return http.Response(
                '{"status":"ok","paypal":{"enabled":false,"environment":"sandbox"},"ai":{"enabled":false}}',
                200, headers: headers,
              );
            }
            if (request.url.path == '/api/catalog') {
              return http.Response('{"count":0,"products":[]}', 200, headers: headers);
            }
            return http.Response('{}', 200, headers: headers);
          }),
        );

  @override
  Future<ChatResponse> sendChat({required String message, preferences}) async {
    sent.add(message);
    return pending == null ? _response(_table) : await pending!.future;
  }
}

void main() {
  setUpAll(() async { await initializeDateFormatting(); });

  testWidgets('screen sends one numeric reply, keeps draft and disables stale choices', (tester) async {
    SharedPreferences.setMockInitialValues({'aicafe.onboarded': true});
    final api = _Api();
    final chat = ChatProvider(api);
    final locale = LocaleProvider('en');
    final profile = ShopperProfileProvider();
    final checkout = CheckoutProvider(api, chat);
    await chat.sendMessage('breakfast options');

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider<ApiService>.value(value: api),
          ChangeNotifierProvider<ChatProvider>.value(value: chat),
          ChangeNotifierProvider<LocaleProvider>.value(value: locale),
          ChangeNotifierProvider<ShopperProfileProvider>.value(value: profile),
          ChangeNotifierProvider<CheckoutProvider>.value(value: checkout),
        ],
        child: MaterialApp(
          locale: const Locale('en'),
          supportedLocales: const [Locale('en'), Locale('tr')],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: const ChatScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final choice = find.byKey(const ValueKey('quick-reply-2'));
    await tester.ensureVisible(choice);
    final staleCallback = tester.widget<ActionChip>(choice).onPressed!;
    await tester.enterText(find.byType(TextField).last, 'Keep this draft');
    final pending = Completer<ChatResponse>();
    api.pending = pending;
    await tester.tap(choice);
    staleCallback(); // second tap in the same frame must not send another turn
    await tester.pump();
    expect(api.sent, ['breakfast options', '2']);
    expect(chat.loading, isTrue);
    expect(tester.widget<ActionChip>(choice).onPressed, isNull);
    expect(tester.widget<TextField>(find.byType(TextField).last).controller!.text,
        'Keep this draft');

    pending.complete(_response(_table));
    await tester.pumpAndSettle();
    staleCallback(); // old callback cannot select against a newer answer
    expect(api.sent, ['breakfast options', '2']);
    expect(chat.loading, isFalse);
    expect(tester.widget<ActionChip>(find.byKey(const ValueKey('quick-reply-2')).last)
        .onPressed, isNotNull);
    expect(tester.takeException(), isNull);

    await tester.pumpWidget(const SizedBox.shrink());
    checkout.dispose();
    profile.dispose();
    locale.dispose();
    chat.dispose();
    api.dispose();
  });
}
