import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:test/test.dart';

/// Regression guard for the runtime crash
///   LocaleDataException: Locale data has not been initialized,
///   call initializeDateFormatting(`<locale>`).
///
/// `AppStrings.timeFormat(lang)` builds `DateFormat('HH:mm', localeTag(lang))`
/// where `localeTag` maps `en -> en_IE` and `tr -> tr_TR` (both non-default
/// intl locales). Before `initializeDateFormatting()` is called (now done in
/// `main()` before `runApp()`), constructing either throws. This test locks in
/// both halves of that contract.
void main() {
  group('intl locale initialization (LocaleDataException regression)', () {
    test('before initialization, the app\u2019s date locales throw', () {
      // Both locales the app actually uses are non-default and therefore
      // require initializeDateFormatting(). This mirrors the reported crash.
      expect(() => DateFormat('HH:mm', 'tr_TR'), throwsA(anything));
      expect(() => DateFormat('HH:mm', 'en_IE'), throwsA(anything));
    });

    test('after initializeDateFormatting(), en_IE and tr_TR HH:mm work',
        () async {
      // Same call main() now performs before runApp().
      await initializeDateFormatting();

      final sample = DateTime(2026, 10, 25, 9, 5);
      expect(DateFormat('HH:mm', 'tr_TR').format(sample), '09:05');
      expect(DateFormat('HH:mm', 'en_IE').format(sample), '09:05');
      expect(DateFormat('HH:mm', 'en_IE').format(sample), '09:05');
    });
  });
}
