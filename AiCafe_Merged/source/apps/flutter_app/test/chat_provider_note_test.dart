import 'package:flutter_app/models/chat_message.dart';
import 'package:flutter_app/services/api_service.dart';
import 'package:flutter_test/flutter_test.dart';

// Parsing of the provider/fallback fields and the caption shown for a backup-provider AI answer.
// Written without a Flutter SDK available: run `flutter test test/chat_provider_note_test.dart`.
void main() {
  Map<String, dynamic> body(Map<String, dynamic> extra) => {
        'sessionId': 's',
        'response': 'Hi',
        'preparedCart': null,
        'checkoutReady': false,
        'toolRounds': 0,
        'messageCount': 2,
        ...extra,
      };

  test('provider and fallback are parsed from the backend response', () {
    final r = ChatResponse.fromJson(
        body({'mode': 'ai', 'provider': 'groq', 'fallback': true}));
    expect(r.provider, 'groq');
    expect(r.fallback, isTrue);
  });

  test('older backends without the fields still parse', () {
    final r = ChatResponse.fromJson(body({'mode': 'ai'}));
    expect(r.provider, isNull);
    expect(r.fallback, isFalse);
  });

  test('a non-string provider is ignored rather than crashing', () {
    final r = ChatResponse.fromJson(body({'mode': 'ai', 'provider': 42}));
    expect(r.provider, isNull);
  });

  ChatMessage msg({ChatMode? mode, String? provider, bool backup = false}) =>
      ChatMessage(
        role: ChatRole.assistant,
        text: 'x',
        timestamp: DateTime(2026, 10, 20),
        mode: mode,
        provider: provider,
        usedBackupProvider: backup,
      );

  test('a real AI answer from a backup provider is captioned with its name', () {
    expect(msg(mode: ChatMode.ai, provider: 'groq', backup: true).providerNote,
        'AI · backup provider (groq)');
  });

  test('no caption for the primary provider, rule-based replies or unknown mode', () {
    expect(msg(mode: ChatMode.ai, provider: 'gemini').providerNote, isNull);
    expect(msg(mode: ChatMode.ruleBased, backup: true).providerNote, isNull);
    expect(msg(backup: true).providerNote, isNull);
  });
}
