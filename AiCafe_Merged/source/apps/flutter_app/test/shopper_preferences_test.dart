import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:flutter_app/models/shopper_preferences.dart';
import 'package:flutter_app/services/shopper_preferences_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('ShopperPreferencesService', () {
    setUp(() {
      SharedPreferences.setMockInitialValues({});
    });

    test('persists dietary choices and cart budget locally', () async {
      final service = ShopperPreferencesService();
      const expected = ShopperPreferences(
        dietary: {'vegan', 'gluten-free'},
        maxBudgetMinor: 2500,
      );

      await service.save(expected);

      final loaded = await service.load();
      expect(loaded.dietary, expected.dietary);
      expect(loaded.maxBudgetMinor, expected.maxBudgetMinor);
    });

    test('ignores dietary values outside the supported catalog labels', () {
      final preferences = ShopperPreferences.fromJson({
        'dietary': ['vegan', 'peanut-free'],
      });

      expect(preferences.dietary, {'vegan'});
    });
  });

  group('ShopperPreferences Wellbeing Guard json', () {
    test('toGuardJson maps client allergen keys to server Wellbeing Guard keys', () {
      const prefs = ShopperPreferences(
        dietary: {'vegan', 'gluten-free'},
        allergens: {'peanut', 'tree-nut', 'fish'},
      );

      final json = prefs.toGuardJson();

      // Diets are sorted.
      expect(json['diets'], ['gluten-free', 'vegan']);
      // peanut -> peanuts, tree-nut -> nuts; fish passes through unchanged.
      expect(
        Set<String>.from(json['allergens'] as List),
        {'peanuts', 'nuts', 'fish'},
      );
    });

    test('isGuardEmpty reflects dietary and allergen state', () {
      expect(const ShopperPreferences().isGuardEmpty, isTrue);
      expect(const ShopperPreferences(dietary: {'vegan'}).isGuardEmpty, isFalse);
      expect(const ShopperPreferences(allergens: {'dairy'}).isGuardEmpty, isFalse);
    });
  });
}
