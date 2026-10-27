import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Holds the active UI language (en / tr) and persists it to SharedPreferences.
///
/// Changing the language calls [notifyListeners], which — because the
/// [MaterialApp] `locale` is bound to this provider — rebuilds the whole tree
/// with the new language without a reload. The storefront + Flutter client stay
/// in sync through the same persisted key.
class LocaleProvider extends ChangeNotifier {
  static const String _storageKey = 'aicafe.lang';

  String _languageCode;

  LocaleProvider([String? initial]) : _languageCode = initial ?? _detectFromPlatform();

  static String _detectFromPlatform() {
    final tag = PlatformDispatcher.instance.locale.toLanguageTag().toLowerCase();
    return tag.startsWith('tr') ? 'tr' : 'en';
  }

  String get languageCode => _languageCode;

  Locale get locale =>
      _languageCode == 'tr' ? const Locale('tr', 'TR') : const Locale('en', 'IE');

  String get localeTag => _languageCode == 'tr' ? 'tr_TR' : 'en_IE';

  /// Loads any persisted language choice. Call once at startup before [runApp].
  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_storageKey);
      if (saved == 'en' || saved == 'tr') {
        _languageCode = saved!;
        notifyListeners();
      }
    } catch (_) {
      // Persistence is best-effort; fall back to the detected platform locale.
    }
  }

  Future<void> setLanguage(String code) async {
    if (code != 'en' && code != 'tr') code = 'en';
    if (code == _languageCode) return;
    _languageCode = code;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_storageKey, code);
    } catch (_) {
      // Persistence is best-effort.
    }
  }
}
