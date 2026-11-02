import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:flutter_app/models/shopper_preferences.dart';
import 'package:flutter_app/services/shopper_preferences_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('ShopperPreferences allergen handling', () {
    test('toJson stays server-shaped (no allergen key sent to backend)', () {
      const prefs = ShopperPreferences(
        dietary: {'vegan'},
        allergens: {'peanut'},
        maxBudgetMinor: 2000,
      );
      final json = prefs.toJson();
      expect(json.containsKey('allergens'), isFalse);
      expect(json['dietary'], containsAll(['vegan']));
      expect(json['maxBudgetMinor'], 2000);
    });

    test('toPersistedJson round-trips allergens via fromPersistedJson', () {
      const prefs = ShopperPreferences(
        dietary: {'vegan'},
        allergens: {'peanut', 'dairy'},
        maxBudgetMinor: 1500,
      );
      final restored = ShopperPreferences.fromPersistedJson(
        Map<String, dynamic>.from(prefs.toPersistedJson()),
      );
      expect(restored.dietary, {'vegan'});
      expect(restored.allergens, {'peanut', 'dairy'});
      expect(restored.maxBudgetMinor, 1500);
    });

    test('fromPersistedJson tolerates a legacy payload with no allergens', () {
      final restored = ShopperPreferences.fromPersistedJson({
        'dietary': ['gluten-free'],
        'maxBudgetMinor': 1000,
      });
      expect(restored.dietary, {'gluten-free'});
      expect(restored.allergens, isEmpty);
      expect(restored.maxBudgetMinor, 1000);
    });

    test('unknown allergen labels are ignored rather than kept', () {
      final restored = ShopperPreferences.fromPersistedJson({
        'allergens': ['peanut', 'shoe-lace'],
      });
      expect(restored.allergens, {'peanut'});
    });
  });

  group('ShopperPreferencesService persistence', () {
    test('persists allergen preferences across save/load', () async {
      SharedPreferences.setMockInitialValues({});
      final service = ShopperPreferencesService();
      const prefs = ShopperPreferences(
        dietary: {'vegan'},
        allergens: {'peanut'},
        maxBudgetMinor: 2500,
      );

      await service.save(prefs);
      final loaded = await service.load();

      expect(loaded.dietary, {'vegan'});
      expect(loaded.allergens, {'peanut'});
      expect(loaded.maxBudgetMinor, 2500);
    });

    test('migrates a legacy v1 payload without losing dietary data', () async {
      SharedPreferences.setMockInitialValues({
        'shopper_preferences_v1': jsonEncode({
          'dietary': ['vegetarian'],
          'maxBudgetMinor': 1200,
        }),
      });
      final service = ShopperPreferencesService();

      final loaded = await service.load();
      expect(loaded.dietary, {'vegetarian'});
      expect(loaded.maxBudgetMinor, 1200);
      expect(loaded.allergens, isEmpty);
    });
  });
}
