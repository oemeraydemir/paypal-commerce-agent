import 'package:flutter_app/l10n/app_strings.dart';
import 'package:flutter_app/models/cart.dart';
import 'package:flutter_app/models/shopper_preferences.dart';

/// A short, server-truthful "Why these items?" explanation attached to an
/// assistant reply that prepared a cart.
///
/// It is built ONLY from fields the backend actually returns in the prepared
/// cart: line items (server names/quantities) and the policy verdict
/// (`reason` + `policyViolations` messages, shown verbatim). Nothing is
/// invented or paraphrased here.
class CartExplanation {
  final List<String> itemLines;
  final List<String> policyNotes;

  const CartExplanation({required this.itemLines, required this.policyNotes});

  bool get isEmpty => itemLines.isEmpty && policyNotes.isEmpty;
}

/// Builds the explanation from a real prepared-cart response.
CartExplanation buildCartExplanation(PreparedCart cart) {
  final itemLines = cart.items.map((l) => '${l.quantity}× ${l.name}').toList();

  final policyNotes = <String>[];
  if (cart.reason.isNotEmpty) policyNotes.add(cart.reason);
  for (final violation in cart.policyViolations) {
    if (violation.message.isNotEmpty) policyNotes.add(violation.message);
  }

  return CartExplanation(itemLines: itemLines, policyNotes: policyNotes);
}

/// The honest allergy notice shown whenever the AI suggests a cart.
///
/// The current backend exposes NO allergen data (`contains` / `may_contain` /
/// `unknown` are nowhere in the catalog schema and no endpoint returns them).
/// Therefore this always reports the allergy information as UNVERIFIED — it
/// never claims an item is "safe", "allergen-free" or otherwise verified. The
/// user's local allergen concerns are named when present, and it is explicitly
/// stated that allergen preferences are stored locally and are NOT filtered
/// server-side.
String buildAllergyWarning(ShopperPreferences preferences, String lang) {
  final core = AppStrings.get(lang, 'allergy.core');

  if (preferences.allergens.isEmpty) {
    return '⚠️ ${AppStrings.get(lang, 'allergy.unverified')} $core';
  }

  final concerns = preferences.allergens
      .map((key) => ShopperPreferences.allergenLabel(lang, key))
      .join(', ');
  return '⚠️ ${AppStrings.get(lang, 'allergy.concerns.prefix')}$concerns. $core '
      '${AppStrings.get(lang, 'allergy.concerns.local')}';
}
