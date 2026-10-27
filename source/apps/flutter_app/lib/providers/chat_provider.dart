import 'dart:async';

import 'package:flutter/foundation.dart';

import 'package:flutter_app/l10n/app_strings.dart';
import 'package:flutter_app/models/cart.dart';
import 'package:flutter_app/models/chat_message.dart';
import 'package:flutter_app/models/shopper_preferences.dart';
import 'package:flutter_app/services/api_service.dart';
import 'package:flutter_app/utils/cart_explanation.dart';

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
    String lang = 'en',
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
          ? AppStrings.get(lang, 'msg.empty')
          : resp.response;
      // When the assistant prepared a cart, attach a server-truthful "Why these
      // items?" note plus the honest (always-unverified) allergy notice. Both
      // are derived only from real response data / local preferences.
      late final CartExplanation? cartExplanation;
      late final String? allergyWarning;
      if (resp.preparedCart != null) {
        cartExplanation = buildCartExplanation(resp.preparedCart!);
        allergyWarning = buildAllergyWarning(preferences, lang);
      } else {
        cartExplanation = null;
        allergyWarning = null;
      }
      _messages.add(
        ChatMessage(
          role: ChatRole.assistant,
          text: text,
          timestamp: DateTime.now(),
          mode: resp.mode,
          provider: resp.provider,
          usedBackupProvider: resp.fallback,
          cartExplanation: cartExplanation,
          allergyWarning: allergyWarning,
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
      _error = AppStrings.get(lang, 'error.timeout');
      _messages.add(
        ChatMessage(
          role: ChatRole.assistant,
          text: '⚠️ $_error',
          timestamp: DateTime.now(),
        ),
      );
    } on ApiException catch (e) {
      _error =
          '${AppStrings.get(lang, 'error.chatPrefix')} (${e.statusCode}): ${e.message}';
      _messages.add(
        ChatMessage(
          role: ChatRole.assistant,
          text: '⚠️ $_error',
          timestamp: DateTime.now(),
        ),
      );
    } catch (e) {
      _error = '${AppStrings.get(lang, 'error.unknown')}: $e';
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

  Future<void> clearConversation([String lang = 'en']) async {
    try {
      await api.deleteChat();
    } catch (e) {
      _error = e is ApiException
          ? '${AppStrings.get(lang, 'error.clearConvPrefix')} (${e.statusCode}): ${e.message}'
          : AppStrings.get(lang, 'error.clearConvUnreachable');
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

  Future<void> clearPreparedCart([String lang = 'en']) async {
    try {
      await api.deletePreparedCart();
    } on ApiException catch (e) {
      _error =
          '${AppStrings.get(lang, 'error.clearCartPrefix')} (${e.statusCode}): ${e.message}';
      notifyListeners();
      rethrow;
    } catch (error) {
      _error = '${AppStrings.get(lang, 'error.clearCartUnreachable')}: $error';
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
