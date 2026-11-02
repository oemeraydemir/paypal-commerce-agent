import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:flutter_app/models/cart.dart';
import 'package:flutter_app/models/chat_message.dart';
import 'package:flutter_app/models/shopper_preferences.dart';
import 'package:flutter_app/providers/chat_provider.dart';
import 'package:flutter_app/services/api_service.dart';
import 'package:flutter_app/services/session_service.dart';

class _FakeApi extends ApiService {
  _FakeApi()
    : super(
        baseUrl: 'http://test',
        storage: InMemorySessionStorage(),
        client: MockClient((_) async => http.Response('{}', 200)),
      );

  Future<ChatResponse> Function(String message, ShopperPreferences? prefs)? onChat;

  @override
  Future<ChatResponse> sendChat({
    required String message,
    ShopperPreferences? preferences,
  }) {
    final handler = onChat;
    if (handler == null) throw StateError('onChat not configured');
    return handler(message, preferences);
  }

  @override
  Future<void> deleteChat() async {}

  @override
  Future<void> deletePreparedCart() async {}
}

ChatResponse _responseWithCart() => ChatResponse(
  sessionId: 'sess',
  response: 'Here is your cart.',
  preparedCart: const PreparedCart(
    items: [
      CartLine(
        productId: 'coffee',
        name: 'Oat Latte',
        quantity: 2,
        unitPriceMinor: 420,
        unitPriceFormatted: '€4.20',
        lineTotalMinor: 840,
        lineTotalFormatted: '€8.40',
      ),
    ],
    totalMinor: 840,
    totalFormatted: '€8.40',
    currency: 'EUR',
    message: '',
    reason: 'Cart exceeds confirmation threshold; explicit approval required',
  ),
  checkoutReady: true,
  toolRounds: 0,
  messageCount: 1,
  mode: ChatMode.ai,
);

ChatResponse _responseWithoutCart() => ChatResponse(
  sessionId: 'sess',
  response: 'Sure!',
  preparedCart: null,
  checkoutReady: false,
  toolRounds: 0,
  messageCount: 1,
  mode: ChatMode.ai,
);

void main() {
  late _FakeApi api;
  late ChatProvider chat;

  setUp(() {
    api = _FakeApi();
    chat = ChatProvider(api);
  });

  tearDown(() {
    chat.dispose();
    api.dispose();
  });

  test('attaches a Why-why-items explanation when a cart is prepared', () async {
    api.onChat = (_, prefs) async => _responseWithCart();

    await chat.sendMessage(
      'two oat lattes',
      preferences: const ShopperPreferences(allergens: {'peanut'}),
    );

    final last = chat.messages.last;
    expect(last.cartExplanation, isNotNull);
    expect(last.cartExplanation!.itemLines, contains('2× Oat Latte'));
    expect(last.cartExplanation!.policyNotes, contains('Cart exceeds confirmation threshold; explicit approval required'));
  });

  test('attaches an unverified allergy warning when a cart is prepared', () async {
    api.onChat = (_, prefs) async => _responseWithCart();

    await chat.sendMessage(
      'two oat lattes',
      preferences: const ShopperPreferences(allergens: {'peanut'}),
    );

    final warning = chat.messages.last.allergyWarning;
    expect(warning, isNotNull);
    expect(warning, contains('unverified'));
    expect(warning, contains('Peanut'));
  });

  test('adds no explanation or allergy section when no cart is returned', () async {
    api.onChat = (_, prefs) async => _responseWithoutCart();

    await chat.sendMessage('hello');

    final last = chat.messages.last;
    expect(last.cartExplanation, isNull);
    expect(last.allergyWarning, isNull);
  });

  test('dietary + budget preferences are what get handed to the server', () async {
    ShopperPreferences? sent;
    api.onChat = (_, prefs) async {
      sent = prefs;
      return _responseWithoutCart();
    };

    await chat.sendMessage(
      'hi',
      preferences: const ShopperPreferences(
        dietary: {'vegan'},
        allergens: {'peanut'},
        maxBudgetMinor: 1000,
      ),
    );

    final serverJson = sent!.toJson();
    // Allergens must never leak to the backend.
    expect(serverJson.containsKey('allergens'), isFalse);
    expect(serverJson['dietary'], containsAll(['vegan']));
    expect(serverJson['maxBudgetMinor'], 1000);
  });
}
