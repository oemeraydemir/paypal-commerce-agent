enum ChatRole { user, assistant, system }

/// A single chat bubble in the AI shopping assistant conversation.
class ChatMessage {
  final ChatRole role;
  final String text;
  final DateTime timestamp;

  ChatMessage({
    required this.role,
    required this.text,
    required this.timestamp,
  });

  bool get isUser => role == ChatRole.user;
}
