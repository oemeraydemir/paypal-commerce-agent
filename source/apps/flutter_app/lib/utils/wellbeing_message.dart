import 'package:flutter_app/l10n/app_strings.dart';

/// Formats an authoritative `/api/wellbeing/check` decision for the shopper.
///
/// The backend evaluates every sensitivity the shopper selected against
/// merchant-provided menu data. This formatter keeps three things separate, in
/// line with FDA guidance and the storefront copy:
///  1. ingredient facts (present / conflicting / missing) per product,
///  2. cross-contact, which the merchant has NOT supplied and which is never
///     collapsed into an ingredient verdict,
///  3. the provenance and limits of the information.
///
/// It never emits "safe", "suitable", "allergen-free" or "gluten-free" as a
/// verdict, because no verified preparation data exists. It also tolerates
/// older backends that only return `conflicts` / `missing` so the old raw
/// "UNKNOWN / Missing information: allergen:gluten" text can never reappear.
String formatWellbeingDecision(
  Map<String, dynamic> decision, {
  String lang = 'en',
}) {
  String s(String key, [List<String> args = const []]) {
    var out = AppStrings.get(lang, key);
    for (final arg in args) {
      final at = out.indexOf('%s');
      if (at < 0) break;
      out = out.replaceRange(at, at + 2, arg);
    }
    return out;
  }

  String label(String restriction) {
    final key = restriction.contains(':')
        ? restriction.split(':').last
        : restriction;
    final translated = AppStrings.get(lang, 'wellbeing.r.$key');
    return translated == 'wellbeing.r.$key' ? key : translated;
  }

  List<Map<String, dynamic>> factsOf(Map<String, dynamic> item) {
    final declared = item['facts'];
    if (declared is List && declared.isNotEmpty) {
      return declared
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    }
    final out = <Map<String, dynamic>>[];
    final conflicts = item['conflicts'];
    if (conflicts is List) {
      for (final c in conflicts) {
        if (c is Map) {
          out.add({
            'restriction': c['restriction'] ?? '',
            'status': 'CONFLICT',
            'ingredients': c['ingredients'] ?? const [],
          });
        }
      }
    }
    final missing = item['missing'];
    if (missing is List) {
      for (final m in missing) {
        out.add({
          'restriction': m.toString(),
          'status': 'UNKNOWN',
          'ingredients': const [],
        });
      }
    }
    return out;
  }

  final lines = <String>[s('wellbeing.heading')];

  // Sensitivities the shopper actually selected, never inferred.
  final checkedNames = <String>[];
  final checked = decision['checked'];
  if (checked is List) {
    for (final c in checked) {
      if (c is Map) {
        final key = (c['key'] ?? c['restriction'] ?? '').toString();
        if (key.isNotEmpty) checkedNames.add(label(key));
      }
    }
  }
  final items = decision['items'];
  final itemMaps = items is List
      ? items.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList()
      : <Map<String, dynamic>>[];
  if (checkedNames.isEmpty && itemMaps.isNotEmpty) {
    for (final f in factsOf(itemMaps.first)) {
      final key = (f['restriction'] ?? f['key'] ?? '').toString();
      if (key.isNotEmpty) checkedNames.add(label(key));
    }
  }
  if (checkedNames.isNotEmpty) {
    lines.add(s('wellbeing.checked', [checkedNames.join(', ')]));
    lines.add(s('wellbeing.checkedHint'));
  }

  // One result block per product.
  for (final item in itemMaps) {
    final name = (item['name'] ?? '—').toString();
    final qty = item['quantity'] ?? 1;
    final status = (item['status'] ?? 'UNKNOWN').toString();
    final state = status == 'CONFIRMED_CONFLICT'
        ? 'conflict'
        : status == 'NO_KNOWN_CONFLICT'
            ? 'clear'
            : 'unknown';
    final factLines = <String>[];
    for (final fact in factsOf(item)) {
      final restriction =
          (fact['restriction'] ?? fact['key'] ?? '').toString();
      final name2 = label(restriction);
      final factStatus = (fact['status'] ?? 'UNKNOWN').toString();
      final rawIngredients = fact['ingredients'];
      final ingredients = rawIngredients is List
          ? rawIngredients
              .map((e) => e.toString())
              .where((e) => e.isNotEmpty)
              .toList()
          : <String>[];
      if (factStatus == 'CONFLICT') {
        factLines.add(ingredients.isEmpty
            ? s('wellbeing.fact.conflict.noList', [name2])
            : s('wellbeing.fact.conflict', [name2, ingredients.join(', ')]));
      } else if (factStatus == 'UNKNOWN') {
        factLines.add(s('wellbeing.fact.unknown', [name2]));
      } else {
        factLines.add(s('wellbeing.fact.clear', [name2]));
      }
    }
    final body = factLines.isEmpty
        ? s('wellbeing.state.$state')
        : factLines.join(' ');
    lines.add('$qty × $name — ${s('wellbeing.state.$state')}: $body '
        '${s('wellbeing.crossContact')}');
  }

  // Source, verifiable data version and limits.
  lines.add(s('wellbeing.source'));
  final source = decision['source'];
  final version = (source is Map ? source['dataVersion'] : null) ??
      decision['productDataVersion'];
  if (version != null && version.toString().isNotEmpty) {
    final v = version.toString();
    lines.add(s('wellbeing.sourceVersion', [v.length > 8 ? v.substring(0, 8) : v]));
  }
  lines.add(s('wellbeing.limit'));

  final alternatives = decision['alternatives'];
  if (alternatives is List && alternatives.isNotEmpty) {
    final names = alternatives
        .whereType<Map>()
        .map((a) => (a['name'] ?? '').toString())
        .where((n) => n.isNotEmpty)
        .take(4)
        .toList();
    if (names.isNotEmpty) {
      lines.add(s('wellbeing.alternatives', [names.join(', ')]));
    }
  }

  return lines.join('\n');
}
