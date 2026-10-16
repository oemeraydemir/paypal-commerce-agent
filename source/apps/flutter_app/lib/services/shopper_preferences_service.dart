import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'package:flutter_app/models/shopper_preferences.dart';

class ShopperPreferencesService {
  static const _storageKey = 'shopper_preferences_v1';

  Future<ShopperPreferences> load() async {
    final preferences = await SharedPreferences.getInstance();
    final encoded = preferences.getString(_storageKey);
    if (encoded == null) return ShopperPreferences.empty;

    final decoded = jsonDecode(encoded);
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('Saved shopper preferences are invalid.');
    }
    return ShopperPreferences.fromJson(decoded);
  }

  Future<void> save(ShopperPreferences value) async {
    final preferences = await SharedPreferences.getInstance();
    final saved = await preferences.setString(
      _storageKey,
      jsonEncode(value.toJson()),
    );
    if (!saved) {
      throw StateError('Could not save shopper preferences on this device.');
    }
  }
}
