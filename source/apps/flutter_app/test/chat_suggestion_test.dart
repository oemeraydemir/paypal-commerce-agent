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

  late ChatResponse reply;
  PolicyPreview preview = const PolicyPreview(
    empty: false,
    decision: PolicyDecision.requireConfirmation,
    reason: 'Needs your approval',
  );
  bool failPreview = false;
  int previewCalls = 0;
  List<OrderItem> lastPreviewItems = const <OrderItem>[];

  @override
  Future<PolicyPreview> previewPolicy(List<OrderItem> items) async {
    previewCalls++;
    lastPreviewItems = items;
    if (failPreview) throw StateError('unavailable');
    return preview;
  }

  @override
  Future<ChatResponse> sendChat({
    required String message,
    ShopperPreferences? preferences,
  }) async => reply;

  @override
  Future<void> deleteChat() async {}

  @override
  Future<void> deletePreparedCart() async {}
}

Map<String, dynamic> _suggestionJson() => {
  'reason': 'OVER_BUDGET',
  'items': [
    {
      'productId': 'flowers_bouquet',
      'name': 'Fresh Flower Bouquet',
      'quantity': 1,
      'unitPriceMinor': 2500,
      'unitPriceFormatted': '€25.00',
      'lineTotalMinor': 2500,
      'lineTotalFormatted': '€25.00',
    },
  ],
  'totalMinor': 2500,
  'totalFormatted': '€25.00',
  'currency': 'EUR',
  'budgetMinor': 700,
  'policyDecision': 'REQUIRE_CONFIRMATION',
};

ChatResponse _reply({
  required String mode,
  Object? suggestion,
}) => ChatResponse.fromJson({
  'sessionId': 's',
  'response': 'The cheapest match is over your budget.',
  'preparedCart': null,
  'checkoutReady': false,
  'toolRounds': 0,
  'messageCount': 2,
  'mode': mode,
  'suggestion': suggestion,
});

void main() {
  group('ChatSuggestion parsing', () {
    test('reads lines, total and a readable label', () {
      final s = ChatSuggestion.tryParse(_suggestionJson())!;
      expect(s.items.single.productId, 'flowers_bouquet');
      expect(s.items.single.quantity, 1);
      expect(s.totalMinor, 2500);
      expect(s.label, '1× Fresh Flower Bouquet');
    });

    test('missing or malformed payloads become null, never an exception', () {
      expect(ChatSuggestion.tryParse(null), isNull);
      expect(ChatSuggestion.tryParse('nope'), isNull);
      expect(ChatSuggestion.tryParse(<String, dynamic>{}), isNull);
      expect(
        ChatSuggestion.tryParse(<String, dynamic>{'items': <dynamic>[]}),
        isNull,
      );
      expect(
        ChatSuggestion.tryParse(<String, dynamic>{
          'items': [
            <String, dynamic>{'productId': '', 'quantity': 0},
          ],
        }),
        isNull,
      );
    });

    test('ChatResponse carries the suggestion; older backends have none', () {
      expect(
        _reply(mode: 'rule-based', suggestion: _suggestionJson()).suggestion,
        isNotNull,
      );
      expect(_reply(mode: 'rule-based').suggestion, isNull);
    });
  });

  group('ChatProvider over-budget suggestion', () {
    late _FakeApi api;
    late ChatProvider chat;

    setUp(() {
      api = _FakeApi();
      chat = ChatProvider(api);
    });

    Future<ChatMessage> askOverBudget() async {
      api.reply = _reply(mode: 'rule-based', suggestion: _suggestionJson());
      await chat.sendMessage('A birthday treat for a friend');
      return chat.messages.last;
    }

    test('the reply keeps the offer but prepares no cart', () async {
      final msg = await askOverBudget();
      expect(msg.suggestion, isNotNull);
      expect(msg.isRuleBased, isTrue);
      expect(chat.lastPreparedCart, isNull);
      expect(chat.checkoutReady, isFalse);
    });

    test('an AI-mode reply never shows the offer', () async {
      api.reply = _reply(mode: 'ai', suggestion: _suggestionJson());
      await chat.sendMessage('anything');
      expect(chat.messages.last.suggestion, isNull);
    });

    test('tap adds the cart after the server policy preview', () async {
      final msg = await askOverBudget();
      final ok = await chat.addSuggestedCart(msg);
      expect(ok, isTrue);
      expect(api.lastPreviewItems.single.id, 'flowers_bouquet');
      expect(chat.lastPreparedCart!.totalMinor, 2500);
      expect(
        chat.lastPreparedCart!.policyDecision,
        PolicyDecision.requireConfirmation,
      );
      expect(chat.lastPreparedCart!.requiresExplicitApproval, isTrue);
      expect(chat.lastPreparedCartMode, ChatMode.ruleBased);
      expect(chat.checkoutReady, isTrue);
      expect(chat.isSuggestionAdded(msg), isTrue);
    });

    test('a second tap does nothing', () async {
      final msg = await askOverBudget();
      await chat.addSuggestedCart(msg);
      expect(await chat.addSuggestedCart(msg), isFalse);
      expect(api.previewCalls, 1);
    });

    test('a BLOCK verdict never creates a cart', () async {
      api.preview = const PolicyPreview(
        empty: false,
        decision: PolicyDecision.block,
        reason: 'Over the per-purchase limit',
      );
      final msg = await askOverBudget();
      expect(await chat.addSuggestedCart(msg), isFalse);
      expect(chat.lastPreparedCart, isNull);
      expect(chat.checkoutReady, isFalse);
      expect(chat.error, 'Over the per-purchase limit');
    });

    test('an unreadable verdict is never treated as allowed', () async {
      api.preview = const PolicyPreview(
        empty: false,
        decision: PolicyDecision.unknown,
      );
      final msg = await askOverBudget();
      expect(await chat.addSuggestedCart(msg), isFalse);
      expect(chat.lastPreparedCart, isNull);
    });

    test('a failing preview leaves the cart empty and reports an error', () async {
      api.failPreview = true;
      final msg = await askOverBudget();
      expect(await chat.addSuggestedCart(msg), isFalse);
      expect(chat.lastPreparedCart, isNull);
      expect(chat.error, isNotNull);
    });
  });
}
