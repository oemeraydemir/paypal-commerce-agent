import 'package:flutter/foundation.dart';

import 'package:flutter_app/models/shopper_preferences.dart';
import 'package:flutter_app/services/shopper_preferences_service.dart';

class ShopperProfileProvider extends ChangeNotifier {
  final ShopperPreferencesService _service;

  ShopperProfileProvider({ShopperPreferencesService? service})
    : _service = service ?? ShopperPreferencesService() {
    load();
  }

  ShopperPreferences _preferences = ShopperPreferences.empty;
  ShopperPreferences get preferences => _preferences;

  bool _loading = true;
  bool get loading => _loading;

  bool _saving = false;
  bool get saving => _saving;

  String? _error;
  String? get error => _error;

  Future<void> load() async {
    _loading = true;
    notifyListeners();
    try {
      _preferences = await _service.load();
      _error = null;
    } catch (error) {
      _error = 'Could not load shopper preferences: $error';
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<bool> save(ShopperPreferences preferences) async {
    _saving = true;
    _error = null;
    notifyListeners();
    try {
      await _service.save(preferences);
      _preferences = preferences;
      return true;
    } catch (error) {
      _error = 'Could not save shopper preferences: $error';
      return false;
    } finally {
      _saving = false;
      notifyListeners();
    }
  }
}
