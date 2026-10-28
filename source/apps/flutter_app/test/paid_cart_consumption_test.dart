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

  Object? deleteError;
  int deleteCalls = 0;

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
  Future<void> deletePreparedCart() async {
    deleteCalls++;
    final error = deleteError;
    if (error != null) throw error;
  }

  @override
  Future<void> deleteChat() async {}
}

void main() {
  late _FakeApi api;
  late ChatProvider chat;

  setUp(() async {
    api = _FakeApi();
    chat = ChatProvider(api);
    await chat.sendMessage('coffee');
    expect(chat.lastPreparedCart, isNotNull);
    expect(chat.checkoutReady, isTrue);
  });

  test('paid cart is consumed and the server cleanup succeeded', () async {
    expect(await chat.consumePaidCart(), isTrue);
    expect(chat.lastPreparedCart, isNull);
    expect(chat.checkoutReady, isFalse);
    expect(api.deleteCalls, 1);
  });

  test('a failing server cleanup (5xx) cannot leave a payable paid cart', () async {
    api.deleteError = ApiException(503, 'unavailable');
    expect(await chat.consumePaidCart(), isFalse);
    expect(chat.lastPreparedCart, isNull);
    expect(chat.checkoutReady, isFalse);
    expect(chat.error, isNotNull);
  });

  test('a network failure also leaves no payable cart', () async {
    api.deleteError = StateError('offline');
    expect(await chat.consumePaidCart(), isFalse);
    expect(chat.lastPreparedCart, isNull);
    expect(chat.checkoutReady, isFalse);
  });
}
