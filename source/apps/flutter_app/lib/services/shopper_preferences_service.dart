import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'package:flutter_app/models/shopper_preferences.dart';

/// Persists [ShopperPreferences] on this device via SharedPreferences.
///
/// Storage format is versioned. The current key (`v2`) stores the local
/// allergen preferences alongside dietary/budget. A legacy `v1` payload is
/// migrated transparently on first read so no preference is silently lost.
class ShopperPreferencesService {
  static const _storageKeyV2 = 'shopper_preferences_v2';
  static const _storageKeyV1 = 'shopper_preferences_v1';

  Future<ShopperPreferences> load() async {
    final preferences = await SharedPreferences.getInstance();

    final encodedV2 = preferences.getString(_storageKeyV2);
    if (encodedV2 != null) {
      return _decode(encodedV2, source: _storageKeyV2);
    }

    // Legacy v1: migrate (it has no allergen fields, so the polite default is
    // an empty allergen set) and store under v2 for next time.
    final encodedV1 = preferences.getString(_storageKeyV1);
    if (encodedV1 != null) {
      final migrated = _decode(encodedV1, source: _storageKeyV1);
      await save(migrated);
      return migrated;
    }

    return ShopperPreferences.empty;
  }

  Future<void> save(ShopperPreferences value) async {
    final preferences = await SharedPreferences.getInstance();
    final saved = await preferences.setString(
      _storageKeyV2,
      jsonEncode(value.toPersistedJson()),
    );
    if (!saved) {
      throw StateError('Could not save shopper preferences on this device.');
    }
  }

  ShopperPreferences _decode(String encoded, {required String source}) {
    final decoded = jsonDecode(encoded);
    if (decoded is! Map<String, dynamic>) {
      throw FormatException('Saved shopper preferences ($source) are invalid.');
    }
    return ShopperPreferences.fromPersistedJson(decoded);
  }
}
