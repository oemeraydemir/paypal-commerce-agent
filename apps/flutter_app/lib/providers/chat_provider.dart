import 'package:flutter/foundation.dart';

import 'package:flutter_app/models/cart.dart';
import 'package:flutter_app/models/chat_message.dart';
import 'package:flutter_app/models/shopper_preferences.dart';
import 'package:flutter_app/services/api_service.dart';

/// Holds the AI shopping-assistant conversation and the most recently prepared
/// cart. It talks only to `POST /api/ai/chat` (and `DELETE /api/ai/chat/:id`)
/// — it never touches payments.
class ChatProvider extends ChangeNotifier {
  final ApiService api;

  ChatProvider(this.api);

  final List<ChatMessage> _messages = <ChatMessage>[];
  List<ChatMessage> get messages => List.unmodifiable(_messages);

  bool _loading = false;
  bool get loading => _loading;

  String? _error;
  String? get error => _error;

  /// Stable per-app session id passed to every chat request (rate-limited
  /// 10/min/session server-side).
  final String sessionId = _newSessionId();

  PreparedCart? _lastPreparedCart;
  PreparedCart? get lastPreparedCart => _lastPreparedCart;

  /// True when the AI has prepared a cart the user can check out.
  bool get checkoutReady => _lastPreparedCart != null;

  static String _newSessionId() =>
      'sess_${DateTime.now().microsecondsSinceEpoch}';

  Future<void> sendMessage(
    String text, {
    ShopperPreferences preferences = ShopperPreferences.empty,
  }) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty || _loading) return;

    _error = null;
    _messages.add(
      ChatMessage(
        role: ChatRole.user,
        text: trimmed,
        timestamp: DateTime.now(),
      ),
    );
    _loading = true;
    notifyListeners();

    try {
      final resp = await api.sendChat(
        sessionId: sessionId,
        message: trimmed,
        preferences: preferences,
      );
      _messages.add(
        ChatMessage(
          role: ChatRole.assistant,
          text: resp.response,
          timestamp: DateTime.now(),
        ),
      );
      if (resp.preparedCart != null) {
        _lastPreparedCart = resp.preparedCart;
      }
    } on ApiException catch (e) {
      _error = 'Chat error (${e.statusCode}): ${e.message}';
      _messages.add(
        ChatMessage(
          role: ChatRole.assistant,
          text: '⚠️ $_error',
          timestamp: DateTime.now(),
        ),
      );
    } catch (e) {
      _error = e.toString();
      _messages.add(
        ChatMessage(
          role: ChatRole.assistant,
          text: '⚠️ $_error',
          timestamp: DateTime.now(),
        ),
      );
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> clearConversation() async {
    try {
      await api.deleteChat(sessionId);
    } catch (e) {
      _error = e is ApiException
          ? 'Could not clear the conversation (${e.statusCode}): ${e.message}'
          : 'Could not reach the server to clear the conversation.';
      notifyListeners();
      return;
    }
    _messages.clear();
    _lastPreparedCart = null;
    _error = null;
    notifyListeners();
  }

  Future<void> clearPreparedCart() async {
    try {
      await api.deletePreparedCart(sessionId);
    } on ApiException catch (e) {
      _error = 'Could not clear the AI cart (${e.statusCode}): ${e.message}';
      notifyListeners();
      rethrow;
    } catch (error) {
      _error = 'Could not reach the server to clear the AI cart: $error';
      notifyListeners();
      rethrow;
    }

    _lastPreparedCart = null;
    _error = null;
    notifyListeners();
  }
}
