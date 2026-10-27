import 'package:flutter_app/models/cart.dart';
import 'package:flutter_app/utils/cart_explanation.dart';

enum ChatRole { user, assistant, system }

/// How the backend produced an assistant reply.
///
/// `POST /api/ai/chat` returns `mode: "ai"` for a normal AI answer and
/// `mode: "rule-based"` for the deterministic Quick Planner used when every AI
/// provider is exhausted (that reply is explicitly **not** AI). Older backends
/// may omit the field, so it is nullable rather than defaulted to `ai`.
enum ChatMode { ai, ruleBased }

/// Parses the backend `mode` value without throwing.
///
/// Unknown or missing values return `null` so a newer/older backend cannot break
/// the client. Only an explicit `"rule-based"` causes the UI to label a reply as
/// non-AI.
ChatMode? chatModeFromJson(Object? value) {
  if (value == 'ai') return ChatMode.ai;
  if (value == 'rule-based') return ChatMode.ruleBased;
  return null;
}

/// A manual "add to cart anyway" offer from a rule-based reply whose cheapest
/// match is over the shopper's soft budget.
///
/// It is **not** a prepared cart and authorises nothing: the client may add
/// these lines to its own cart, after which the server re-prices and
/// policy-checks them (see `ChatProvider.addSuggestedCart`).
class ChatSuggestion {
  final List<CartLine> items;
  final int totalMinor;
  final String totalFormatted;
  final String currency;

  const ChatSuggestion({
    required this.items,
    required this.totalMinor,
    required this.totalFormatted,
    this.currency = 'EUR',
  });

  /// Returns `null` for a missing or malformed payload so an older/newer
  /// backend can never break the chat UI.
  static ChatSuggestion? tryParse(Object? raw) {
    if (raw is! Map<String, dynamic>) return null;
    final rawItems = raw['items'];
    if (rawItems is! List) return null;
    final lines = rawItems
        .whereType<Map<String, dynamic>>()
        .map(CartLine.fromJson)
        .where((l) => l.productId.isNotEmpty && l.quantity > 0)
        .toList();
    if (lines.isEmpty) return null;
    final total = (raw['totalMinor'] as num?)?.toInt() ??
        lines.fold<int>(0, (sum, l) => sum + l.lineTotalMinor);
    return ChatSuggestion(
      items: lines,
      totalMinor: total,
      totalFormatted: raw['totalFormatted'] as String? ?? '',
      currency: raw['currency'] is String ? raw['currency'] as String : 'EUR',
    );
  }

  /// e.g. `1× Fresh Flower Bouquet`.
  String get label => items.map((l) => '${l.quantity}× ${l.name}').join(', ');
}

/// A single chat bubble in the AI shopping assistant conversation.
class ChatMessage {
  final ChatRole role;
  final String text;
  final DateTime timestamp;

  /// Backend-declared mode for assistant replies (`ai` / `rule-based`).
  /// `null` for user messages and for backends that predate the field.
  final ChatMode? mode;

  /// AI provider that answered and whether a backup provider had to step in.
  final String? provider;
  final bool usedBackupProvider;

  /// Server-truthful "Why these items?" note for a reply that prepared a cart.
  /// `null` for user messages and for replies with no prepared cart.
  final CartExplanation? cartExplanation;

  /// Honest allergy notice for a reply that prepared a cart. Always present
  /// when a cart is suggested because the backend publishes no verified allergen
  /// data; never claims safety.
  final String? allergyWarning;

  /// Manual add-anyway offer (rule-based, over budget). `null` otherwise.
  final ChatSuggestion? suggestion;

  ChatMessage({
    required this.role,
    required this.text,
    required this.timestamp,
    this.mode,
    this.provider,
    this.usedBackupProvider = false,
    this.cartExplanation,
    this.allergyWarning,
    this.suggestion,
  });

  /// Short, truthful caption for a real AI answer that came from a backup
  /// provider; `null` when nothing needs saying (primary answered, rule-based
  /// replies have their own label, or the backend predates the fields).
  String? get providerNote {
    if (mode != ChatMode.ai || !usedBackupProvider) return null;
    final name = provider;
    return name == null || name.isEmpty
        ? 'AI · backup provider'
        : 'AI · backup provider ($name)';
  }

  bool get isUser => role == ChatRole.user;

  /// True only when the backend explicitly said this reply was rule-based.
  bool get isRuleBased => mode == ChatMode.ruleBased;
}
