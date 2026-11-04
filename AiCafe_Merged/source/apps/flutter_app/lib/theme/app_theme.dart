import 'package:flutter/material.dart';

import 'package:flutter_app/theme/tokens.g.dart';

/// AI Café — "Premium Specialty Café" design system.
///
/// Palette: bright white surfaces · charcoal ink typography · deep forest-green
/// primary · leaf-green positive · slate for AI/informational accents.
///
/// Mood rule (from the redesign spec): discovery/home surfaces are airy and
/// editorial; payment/cart surfaces are calm and transparent (clear totals and
/// clear spending permission); AI chat reads like a conversation with a barista.
/// Play the green accent down on secondary surfaces and keep charcoal-on-white
/// for a premium, high-contrast look.

/// The AI Café brand palette as named tokens.
abstract final class AppColors {
  // Surfaces & text
  static const Color white = AcLight.surface;
  static const Color surfaceAlt = AcLight.surfaceAlt;
  static const Color surfaceAltHigh = Color(0xFFF6E6DD);
  static const Color ink = AcLight.ink;
  static const Color inkMuted = AcLight.muted;
  static const Color outline = AcLight.line;
  static const Color outlineVariant = Color(0xFFF5E9E2);

  // Brand accents
  static const Color green = AcLight.coralStrong; // brand coral, generated from design/tokens.json (same as web --brand)
  static const Color greenDark = Color(0xFFB03224);
  static const Color greenTint = AcLight.coralSoft;
  static const Color leaf = AcLight.ok;
  static const Color leafTint = AcLight.mint;
  static const Color slate = AcLight.skyInk;
  static const Color slateTint = AcLight.sky;

  /// Warm app canvas (web --bg).
  static const Color canvas = AcLight.canvas;

  // Semantic
  static const Color success = AcLight.ok;
  static const Color error = AcLight.bad;
  static const Color errorContainer = Color(0xFFF6DDDD);
  static const Color shadow = Color(0x1416181D);
}

/// Builds the light "Premium Specialty Café" [ThemeData].
ThemeData buildPremiumCafeTheme() {
  const scheme = ColorScheme(
    brightness: Brightness.light,
    primary: AppColors.green,
    onPrimary: Colors.white,
    primaryContainer: AppColors.greenTint,
    onPrimaryContainer: Color(0xFF4A120B),
    secondary: AppColors.leaf,
    onSecondary: Colors.white,
    secondaryContainer: AppColors.leafTint,
    onSecondaryContainer: Color(0xFF0C3326),
    tertiary: AppColors.slate,
    onTertiary: Colors.white,
    tertiaryContainer: AppColors.slateTint,
    onTertiaryContainer: Color(0xFF1B2735),
    error: AppColors.error,
    onError: Colors.white,
    errorContainer: AppColors.errorContainer,
    onErrorContainer: Color(0xFF4A1414),
    surface: AppColors.white,
    onSurface: AppColors.ink,
    onSurfaceVariant: AppColors.inkMuted,
    surfaceContainerLowest: Color(0xFFFFFFFF),
    surfaceContainerLow: Color(0xFFF7F8FA),
    surfaceContainer: AppColors.surfaceAlt,
    surfaceContainerHigh: Color(0xFFECEEF1),
    surfaceContainerHighest: Color(0xFFE6E9ED),
    outline: AppColors.outline,
    outlineVariant: AppColors.outlineVariant,
    shadow: AppColors.shadow,
    scrim: Color(0x66000000),
    inverseSurface: AppColors.ink,
    onInverseSurface: Colors.white,
    inversePrimary: Color(0xFFFFB3A6),
    surfaceTint: AppColors.green,
  );

  final textTheme = Typography.material2021().black.apply(
        bodyColor: AppColors.ink,
        displayColor: AppColors.ink,
      );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    brightness: Brightness.light,
    scaffoldBackgroundColor: AppColors.canvas,
    splashFactory: InkSparkle.splashFactory,
    textTheme: textTheme,
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.canvas,
      foregroundColor: AppColors.ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: AppColors.ink,
        fontSize: 20,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.4,
      ),
    ),
    cardTheme: CardThemeData(
      color: AppColors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AcShape.radiusCard),
        side: const BorderSide(color: AppColors.outline),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: AppColors.surfaceAltHigh,
      selectedColor: AppColors.greenTint,
      disabledColor: AppColors.surfaceAltHigh.withValues(alpha: 0.5),
      labelStyle: const TextStyle(color: AppColors.ink, fontSize: 13),
      secondaryLabelStyle: const TextStyle(color: AppColors.ink),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(999),
        side: const BorderSide(color: AppColors.outline),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.green,
        foregroundColor: Colors.white,
        disabledBackgroundColor: AppColors.surfaceAltHigh,
        disabledForegroundColor: AppColors.inkMuted,
        elevation: 0,
        minimumSize: const Size(64, 48),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AcShape.radiusControl)),
        textStyle: const TextStyle(
          fontWeight: FontWeight.w700,
          fontSize: 15,
          letterSpacing: 0.1,
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.ink,
        side: const BorderSide(color: AppColors.outline),
        minimumSize: const Size(64, 48),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AcShape.radiusControl)),
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: AppColors.greenDark,
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.surfaceAlt,
      hintStyle: const TextStyle(color: AppColors.inkMuted),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(18),
        borderSide: const BorderSide(color: AppColors.outline),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(18),
        borderSide: const BorderSide(color: AppColors.outline),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(18),
        borderSide: const BorderSide(color: AppColors.green, width: 1.6),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(18),
        borderSide: const BorderSide(color: AppColors.error),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(18),
        borderSide: const BorderSide(color: AppColors.error, width: 1.6),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: AppColors.ink,
      contentTextStyle: const TextStyle(color: Colors.white),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
    dividerTheme: const DividerThemeData(
      color: AppColors.outlineVariant,
      thickness: 1,
      space: 1,
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: AppColors.green,
      linearTrackColor: AppColors.surfaceAltHigh,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AppColors.white,
      surfaceTintColor: Colors.transparent,
      indicatorColor: AppColors.greenTint,
      height: 72,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          fontSize: 12,
          fontWeight: states.contains(WidgetState.selected)
              ? FontWeight.w700
              : FontWeight.w500,
          color: states.contains(WidgetState.selected)
              ? AppColors.greenDark
              : AppColors.inkMuted,
        ),
      ),
    ),
    textSelectionTheme: const TextSelectionThemeData(
      cursorColor: AppColors.green,
      selectionColor: Color(0x381E5B46),
      selectionHandleColor: AppColors.green,
    ),
  );
}
