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

  /// Messages whose over-budget suggestion the shopper already added.
  final Set<ChatMessage> _addedSuggestions = <ChatMessage>{};
  bool isSuggestionAdded(ChatMessage msg) => _addedSuggestions.contains(msg);

  bool _addingSuggestion = false;
  bool get addingSuggestion => _addingSuggestion;

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
        int? merchantPolicyLimitMinor;
        var merchantCurrency = 'EUR';
        if (preferences.maxBudgetMinor != null) {
          try {
            // Empty-cart policy preview is side-effect-free and returns the
            // current server-enforced per-purchase limit for the note below.
            final limits = await api.previewPolicy(const <OrderItem>[]);
            merchantPolicyLimitMinor = limits.maxPerPurchaseMinor;
            merchantCurrency = limits.currency;
          } catch (_) {
            // Keep the prepared cart usable; the localized note says that the
            // merchant limit could not be loaded instead of inventing a value.
          }
        }
        cartExplanation = buildCartExplanation(
          resp.preparedCart!,
          preferences: preferences,
          merchantPolicyLimitMinor: merchantPolicyLimitMinor,
          merchantCurrency: merchantCurrency,
          lang: lang,
        );
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
          suggestion: resp.preparedCart == null && resp.isRuleBased
              ? resp.suggestion
              : null,
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

  /// Adds an over-budget rule-based suggestion to the cart **on the shopper's
  /// explicit tap**. The server's policy preview decides whether the cart may
  /// proceed: a `BLOCK` or an unreadable verdict never produces a cart, and the
  /// payment still needs the separate PayPal approval step.
  Future<bool> addSuggestedCart(ChatMessage msg, [String lang = 'en']) async {
    final suggestion = msg.suggestion;
    if (suggestion == null ||
        _loading ||
        _addingSuggestion ||
        _addedSuggestions.contains(msg)) {
      return false;
    }
    _addingSuggestion = true;
    _error = null;
    notifyListeners();
    try {
      final preview = await api.previewPolicy(
        suggestion.items
            .map((l) => OrderItem(id: l.productId, quantity: l.quantity))
            .toList(),
      );
      if (preview.decision != PolicyDecision.autoAllow &&
          preview.decision != PolicyDecision.requireConfirmation) {
        _error = preview.decision == PolicyDecision.block
            ? (preview.reason ?? AppStrings.get(lang, 'suggest.blocked'))
            : AppStrings.get(lang, 'suggest.failed');
        return false;
      }
      _lastPreparedCart = PreparedCart(
        items: suggestion.items,
        totalMinor: suggestion.totalMinor,
        totalFormatted: suggestion.totalFormatted,
        currency: suggestion.currency,
        message: '',
        policyDecision: preview.decision,
        requiresExplicitApproval:
            preview.decision == PolicyDecision.requireConfirmation,
        reason: preview.reason ?? '',
      );
      _lastPreparedCartMode = ChatMode.ruleBased;
      _checkoutReady = true;
      _addedSuggestions.add(msg);
      return true;
    } catch (_) {
      _error = AppStrings.get(lang, 'suggest.failed');
      return false;
    } finally {
      _addingSuggestion = false;
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
    _addedSuggestions.clear();
    _lastPreparedCart = null;
    _lastPreparedCartMode = null;
    _checkoutReady = false;
    _error = null;
    notifyListeners();
  }

  /// Consumes the prepared cart **after a successful payment**.
  ///
  /// The local cart is dropped first and unconditionally, so a failing or slow
  /// server cleanup can never leave an already-paid cart that could be paid a
  /// second time. The server-side delete is best effort; the returned value says
  /// whether it succeeded so the caller can show an honest notice.
  Future<bool> consumePaidCart([String lang = 'en']) async {
    _lastPreparedCart = null;
    _lastPreparedCartMode = null;
    _checkoutReady = false;
    _error = null;
    notifyListeners();
    try {
      await api.deletePreparedCart();
      return true;
    } catch (error) {
      _error = error is ApiException
          ? '${AppStrings.get(lang, 'error.clearCartPrefix')} (${error.statusCode}): ${error.message}'
          : '${AppStrings.get(lang, 'error.clearCartUnreachable')}: $error';
      notifyListeners();
      return false;
    }
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
