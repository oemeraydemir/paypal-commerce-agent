import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:flutter_app/models/cart.dart';
import 'package:flutter_app/models/chat_message.dart';
import 'package:flutter_app/models/shopper_preferences.dart';
import 'package:flutter_app/providers/chat_provider.dart';
import 'package:flutter_app/services/api_service.dart';
import 'package:flutter_app/services/session_service.dart';

/// Test double for [ApiService]: the HTTP layer is never reached because
/// [sendChat] is overridden. The real models/parsing are exercised separately
/// in `api_service_test.dart`.
class _FakeApi extends ApiService {
  _FakeApi()
    : super(
        baseUrl: 'http://test',
        storage: InMemorySessionStorage(),
        client: MockClient((_) async => http.Response('{}', 200)),
      );

  Future<ChatResponse> Function(String message)? onChat;
  PolicyPreview policyPreview = const PolicyPreview(
    empty: true,
    decision: PolicyDecision.unknown,
  );
  bool failPolicyPreview = false;
  int policyPreviewCalls = 0;

  @override
  Future<PolicyPreview> previewPolicy(List<OrderItem> items) async {
    policyPreviewCalls++;
    if (failPolicyPreview) throw StateError('policy preview unavailable');
    return policyPreview;
  }

  @override
  Future<ChatResponse> sendChat({
    required String message,
    ShopperPreferences? preferences,
  }) {
    final handler = onChat;
    if (handler == null) throw StateError('onChat not configured');
    return handler(message);
  }

  @override
  Future<void> deleteChat() async {}

  @override
  Future<void> deletePreparedCart() async {}
}

ChatResponse _response({
  String text = 'ok',
  ChatMode? mode,
  PreparedCart? cart,
  bool checkoutReady = false,
}) => ChatResponse(
  sessionId: 'sess',
  response: text,
  preparedCart: cart,
  checkoutReady: checkoutReady,
  toolRounds: 0,
  messageCount: 1,
  mode: mode,
);

PreparedCart _cart(String productId) => PreparedCart(
  items: [
    CartLine(
      productId: productId,
      name: productId,
      quantity: 1,
      unitPriceMinor: 300,
      unitPriceFormatted: '€3.00',
      lineTotalMinor: 300,
      lineTotalFormatted: '€3.00',
    ),
  ],
  totalMinor: 300,
  totalFormatted: '€3.00',
  currency: 'EUR',
  message: 'ok',
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
  test('includes personal budget and merchant policy limit with a prepared cart', () async {
    api.onChat = (_) async => _response(cart: _cart('oat-latte'));
    api.policyPreview = const PolicyPreview(
      empty: true,
      decision: PolicyDecision.unknown,
      maxPerPurchaseMinor: 3500,
      currency: 'EUR',
    );

    await chat.sendMessage(
      'two oat lattes under €20',
      preferences: const ShopperPreferences(maxBudgetMinor: 2000),
      lang: 'en',
    );

    expect(api.policyPreviewCalls, 1);
    final note = chat.messages.last.cartExplanation!.policyNotes.join(' ');
    expect(note, contains('Your personal budget'));
    expect(note, contains('Merchant policy limit per purchase'));
    expect(note, contains('Both apply'));
    expect(note, contains('€20.00'));
    expect(note, contains('€35.00'));
  });

  test('discloses unavailable policy limit without failing a prepared chat', () async {
    api.onChat = (_) async => _response(cart: _cart('oat-latte'));
    api.failPolicyPreview = true;

    await chat.sendMessage(
      'two oat lattes under €20',
      preferences: const ShopperPreferences(maxBudgetMinor: 2000),
      lang: 'en',
    );

    expect(chat.messages.last.cartExplanation, isNotNull);
    final note = chat.messages.last.cartExplanation!.policyNotes.join(' ');
    expect(note, contains('could not be loaded'));
    expect(note, isNot(contains('Both apply')));
  });


  test('exposes rule-based mode for the reply and the prepared cart', () async {
    api.onChat = (_) async => _response(
      text: 'Rule-based reply (no AI)',
      mode: ChatMode.ruleBased,
      cart: _cart('coffee'),
      checkoutReady: true,
    );

    await chat.sendMessage('breakfast');

    expect(chat.messages.last.mode, ChatMode.ruleBased);
    expect(chat.messages.last.isRuleBased, isTrue);
    expect(chat.lastPreparedCartMode, ChatMode.ruleBased);
    expect(chat.checkoutReady, isTrue);
  });

  test('honors the server checkoutReady flag for a prepared cart', () async {
    api.onChat = (_) async => _response(
      mode: ChatMode.ai,
      cart: _cart('coffee'),
      checkoutReady: false,
    );

    await chat.sendMessage('coffee');

    expect(chat.lastPreparedCart, isNotNull);
    expect(chat.checkoutReady, isFalse);
  });

  test(
    'keeps a valid prepared cart across a follow-up reply with no cart',
    () async {
      var calls = 0;
      api.onChat = (_) async {
        calls++;
        return calls == 1
            ? _response(
                mode: ChatMode.ai,
                cart: _cart('coffee'),
                checkoutReady: true,
              )
            : _response(text: 'You are welcome.');
      };

      await chat.sendMessage('coffee');
      await chat.sendMessage('thanks');

      expect(chat.lastPreparedCart, isNotNull);
      expect(chat.checkoutReady, isTrue);
      expect(chat.lastPreparedCartMode, ChatMode.ai);
    },
  );

  test('shows a clear fallback for an empty response', () async {
    api.onChat = (_) async => _response(text: '   ');

    await chat.sendMessage('hi');

    expect(chat.messages.last.text, contains('empty response'));
  });

  test('maps a timeout to a friendly error instead of a raw exception', () async {
    api.onChat = (_) async => throw TimeoutException('slow');

    await chat.sendMessage('hi');

    expect(chat.error, contains('timed out'));
    expect(chat.loading, isFalse);
    expect(chat.messages.last.text, contains('timed out'));
  });

  test('surfaces HTTP errors with their status', () async {
    api.onChat = (_) async => throw ApiException(503, 'OpenAI not configured');

    await chat.sendMessage('hi');

    expect(chat.error, contains('503'));
    expect(chat.error, contains('OpenAI not configured'));
    expect(chat.loading, isFalse);
  });

  test(
    'clearing the conversation resets checkout readiness and cart mode',
    () async {
      api.onChat = (_) async => _response(
        mode: ChatMode.ai,
        cart: _cart('coffee'),
        checkoutReady: true,
      );

      await chat.sendMessage('coffee');
      expect(chat.checkoutReady, isTrue);

      await chat.clearConversation();

      expect(chat.checkoutReady, isFalse);
      expect(chat.lastPreparedCart, isNull);
      expect(chat.lastPreparedCartMode, isNull);
    },
  );
}
