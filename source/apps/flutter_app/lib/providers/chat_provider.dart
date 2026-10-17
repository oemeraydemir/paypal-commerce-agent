import 'dart:async';

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

  PreparedCart? _lastPreparedCart;
  PreparedCart? get lastPreparedCart => _lastPreparedCart;

  /// Backend mode associated with [lastPreparedCart] (`ai` / `rule-based`).
  /// The UI uses this so a rule-based cart is never labelled "AI-prepared".
  ChatMode? _lastPreparedCartMode;
  ChatMode? get lastPreparedCartMode => _lastPreparedCartMode;

  /// Server-authoritative readiness for the cart that was actually prepared.
  bool _checkoutReady = false;

  /// True only when the backend said the prepared cart is ready for checkout.
  bool get checkoutReady => _checkoutReady && _lastPreparedCart != null;

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
        message: trimmed,
        preferences: preferences,
      );
      final text = resp.response.trim().isEmpty
          ? 'The assistant returned an empty response. Please try again.'
          : resp.response;
      _messages.add(
        ChatMessage(
          role: ChatRole.assistant,
          text: text,
          timestamp: DateTime.now(),
          mode: resp.mode,
        ),
      );
      // Only a newly prepared cart replaces the current one, so a follow-up
      // reply without a cart does not discard a still-valid cart. For that
      // cart, the server's checkoutReady flag is authoritative.
      if (resp.preparedCart != null) {
        _lastPreparedCart = resp.preparedCart;
        _lastPreparedCartMode = resp.mode;
        _checkoutReady = resp.checkoutReady;
      }
    } on TimeoutException {
      _error = 'The AI request timed out. Check your connection and try again.';
      _messages.add(
        ChatMessage(
          role: ChatRole.assistant,
          text: '⚠️ $_error',
          timestamp: DateTime.now(),
        ),
      );
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
      await api.deleteChat();
    } catch (e) {
      _error = e is ApiException
          ? 'Could not clear the conversation (${e.statusCode}): ${e.message}'
          : 'Could not reach the server to clear the conversation.';
      notifyListeners();
      return;
    }
    _messages.clear();
    _lastPreparedCart = null;
    _lastPreparedCartMode = null;
    _checkoutReady = false;
    _error = null;
    notifyListeners();
  }

  Future<void> clearPreparedCart() async {
    try {
      await api.deletePreparedCart();
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
    _lastPreparedCartMode = null;
    _checkoutReady = false;
    _error = null;
    notifyListeners();
  }
}
