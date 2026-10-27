import 'package:flutter_test/flutter_test.dart';

import 'package:flutter_app/models/cart.dart';
import 'package:flutter_app/models/shopper_preferences.dart';
import 'package:flutter_app/utils/cart_explanation.dart';

PreparedCart _cart({
  List<CartLine>? items,
  String reason = '',
  List<PolicyViolation> violations = const [],
}) => PreparedCart(
  items: items ??
      [
        CartLine(
          productId: 'coffee',
          name: 'Oat Latte',
          quantity: 2,
          unitPriceMinor: 420,
          unitPriceFormatted: '€4.20',
          lineTotalMinor: 840,
          lineTotalFormatted: '€8.40',
        ),
      ],
  totalMinor: 840,
  totalFormatted: '€8.40',
  currency: 'EUR',
  message: '',
  reason: reason,
  policyViolations: violations,
);

void main() {
  group('buildCartExplanation', () {
    test('uses real server item names and quantities', () {
      final explanation = buildCartExplanation(_cart());
      expect(explanation.itemLines, contains('2× Oat Latte'));
    });

    test('includes server policy reason verbatim', () {
      final explanation = buildCartExplanation(
        _cart(reason: 'Cart exceeds confirmation threshold; explicit approval required'),
      );
      expect(explanation.policyNotes, contains('Cart exceeds confirmation threshold; explicit approval required'));
    });

    test('includes policy violation messages verbatim', () {
      final explanation = buildCartExplanation(
        _cart(
          violations: const [
            PolicyViolation(
              type: 'CONFIRMATION_THRESHOLD_EXCEEDED',
              message: 'Cart exceeds confirmation threshold',
            ),
          ],
        ),
      );
      expect(explanation.policyNotes, contains('Cart exceeds confirmation threshold'));
    });

    test('is empty only when there is nothing to say', () {
      expect(buildCartExplanation(_cart()).isEmpty, isFalse);
    });
  });

  group('buildAllergyWarning', () {
    test('never claims safety when no concerns are noted', () {
      final warning = buildAllergyWarning(ShopperPreferences.empty, 'en');
      expect(warning, contains('unverified'));
      expect(warning, isNot(contains('safe for your')));
      expect(warning, contains('does not publish allergen data'));
    });

    test('names the shopper concern when set', () {
      const prefs = ShopperPreferences(allergens: {'peanut', 'dairy'});
      final warning = buildAllergyWarning(prefs, 'en');
      expect(warning, contains('Peanut'));
      expect(warning, contains('Dairy / milk'));
    });

    test('explicitly states allergen preferences are local and not server-filtered', () {
      final warning = buildAllergyWarning(const ShopperPreferences(allergens: {'peanut'}), 'en');
      expect(warning, contains('stored locally'));
      expect(warning, contains('not filtered server-side'));
    });
  });
}
