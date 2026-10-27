/// Display-only option metadata. Selection still goes through ChatProvider.
class QuickReply {
  final String id;
  final String label;

  const QuickReply({required this.id, required this.label});
}

/// Recognizes explicit EN/TR options, not arbitrary numbered instructions.
/// Kept in parity with backend/src/ai/quick-replies.ts and public/app.js.
List<QuickReply> extractQuickReplies(String raw) {
  final options = <QuickReply>[];
  var table = false;
  var list = false;
  var fence = '';
  var invalid = false;
  String clean(String text) => text
      .replaceAll(RegExp('[\uFE0F\u20E3]'), '')
      .replaceAll(RegExp(r'\*\*|__'), '')
      .trim();
  List<String> cells(String text) {
    final parts = text.split('|').map((part) => part.trim()).toList();
    if (parts.isNotEmpty && parts.first.isEmpty) parts.removeAt(0);
    if (parts.isNotEmpty && parts.last.isEmpty) parts.removeLast();
    return parts;
  }

  void add(String first, [String fallback = '']) {
    final match = RegExp(
      r'^(?:(?:option|seçenek)\s*)?(\d+)(?:\s*[.)\]:-]\s*|\s+|$)(.*)$',
      caseSensitive: false,
    ).firstMatch(clean(first));
    if (match == null) {
      invalid = true;
      return;
    }
    final tail = match.group(2)!;
    final label = clean(tail.isEmpty ? fallback : tail)
        .replaceAll(RegExp(r'\s+'), ' ');
    final id = match.group(1)!;
    if (label.isEmpty || int.tryParse(id) != options.length + 1 ||
        options.length >= 4) {
      invalid = true;
      return;
    }
    options.add(QuickReply(
      id: id,
      label: label.length > 80 ? label.substring(0, 80) : label,
    ));
  }

  for (final source in raw.replaceAll(RegExp(r'\r\n?'), '\n').split('\n')) {
    final line = source.trim();
    final marker = RegExp(r'^(?:`{3,}|~{3,})').firstMatch(line);
    if (marker != null) {
      final character = marker.group(0)![0];
      if (fence.isEmpty) {
        fence = character;
      } else if (fence == character) {
        fence = '';
      }
      continue;
    }
    if (fence.isNotEmpty) continue;
    final parts = cells(line);
    if (parts.length >= 2 &&
        RegExp(r'^(?:options?|seçenek(?:ler)?)$', caseSensitive: false)
            .hasMatch(clean(parts[0]))) {
      table = true;
      list = false;
      continue;
    }
    if (table && parts.length >= 2) {
      if (parts.every((part) => RegExp(r'^:?-{3,}:?$').hasMatch(part))) {
        continue;
      }
      add(parts[0], parts[1]);
      continue;
    }
    table = false;
    if (RegExp(r'^(?:#{1,6}\s*)?(?:options?|seçenek(?:ler)?)\s*:?$',
            caseSensitive: false)
        .hasMatch(clean(line))) {
      list = true;
      continue;
    }
    final candidate = clean(line).replaceFirst(RegExp(r'^[-*•]\s+'), '');
    final explicit = RegExp(r'^(?:option|seçenek)\s*\d', caseSensitive: false)
            .hasMatch(candidate) ||
        RegExp('^\\d\uFE0F?\u20E3').hasMatch(
            line.replaceFirst(RegExp(r'^(?:[-*•]\s+|\*\*)'), ''));
    if (explicit || (list && RegExp(r'^\d+[.)]\s+').hasMatch(candidate))) {
      add(candidate);
    } else if (line.isNotEmpty) {
      list = false;
    }
  }
  return !invalid && options.length >= 2 ? options : const [];
}
