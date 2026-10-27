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

  ChatMessage({
    required this.role,
    required this.text,
    required this.timestamp,
    this.mode,
    this.provider,
    this.usedBackupProvider = false,
    this.cartExplanation,
    this.allergyWarning,
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
