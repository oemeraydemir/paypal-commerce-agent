import 'package:flutter/material.dart';

/// AI Café — "Bright Fusion" design system.
///
/// Palette: Coral (primary) · Mint (secondary) · Violet (tertiary) · Sun (accent)
/// Ink (text/surfaces-on) · Cream (surfaces/background).
///
/// Mood rule (from the design brief): the main/ordering surfaces stay vibrant and
/// warm; payment screens stay calm and trustworthy; the merchant/business view is
/// more functional. Play aggressive accents down on secondary surfaces (Cream +
/// a single accent), and keep the Ink text on Cream for a premium, readable look.

/// The AI Café brand palette as named tokens.
abstract final class AppColors {
  // Accents
  static const Color coral = Color(0xFFF4603A);
  static const Color coralDark = Color(0xFFD94A2E);
  static const Color sun = Color(0xFFFFC145);
  static const Color mint = Color(0xFF23B8A0);
  static const Color mintDark = Color(0xFF17A08B);
  static const Color violet = Color(0xFF7A5CFA);
  static const Color violetDark = Color(0xFF5F3FE4);
  static const Color primaryContainer = Color(0xFFFFE0D6);

  // Ink & Cream
  static const Color ink = Color(0xFF1E2432);
  static const Color inkMuted = Color(0xFF5A6474);
  static const Color cream = Color(0xFFFFF9F2);
  static const Color creamContainer = Color(0xFFF7EDE2);
  static const Color creamContainerHighest = Color(0xFFF0E3D6);

  // Semantic
  static const Color success = Color(0xFF17A08B);
  static const Color error = Color(0xFFD43C3C);
  static const Color outline = Color(0xFFCBBFB0);
  static const Color outlineVariant = Color(0xFFE9DDD1);
  static const Color surfaceCard = Color(0xFFFFFFFF);
}

/// Builds the light "Bright Fusion" [ThemeData].
ThemeData buildBrightFusionTheme() {
  const scheme = ColorScheme(
    brightness: Brightness.light,
    primary: AppColors.coral,
    onPrimary: Colors.white,
    primaryContainer: Color(0xFFFFE0D6),
    onPrimaryContainer: Color(0xFF7A2310),
    secondary: AppColors.mint,
    onSecondary: Colors.white,
    secondaryContainer: Color(0xFFD6F5EE),
    onSecondaryContainer: Color(0xFF043B32),
    tertiary: AppColors.violet,
    onTertiary: Colors.white,
    tertiaryContainer: Color(0xFFE5DEFE),
    onTertiaryContainer: Color(0xFF241152),
    error: AppColors.error,
    onError: Colors.white,
    errorContainer: Color(0xFFFFDAD6),
    onErrorContainer: Color(0xFF410002),
    surface: AppColors.cream,
    onSurface: AppColors.ink,
    onSurfaceVariant: AppColors.inkMuted,
    surfaceContainerLowest: Color(0xFFFFFFFF),
    surfaceContainerLow: Color(0xFFFBF3E9),
    surfaceContainer: AppColors.creamContainer,
    surfaceContainerHigh: Color(0xFFF4E9DC),
    surfaceContainerHighest: AppColors.creamContainerHighest,
    outline: AppColors.outline,
    outlineVariant: AppColors.outlineVariant,
    shadow: Color(0x1F1E2432),
    scrim: Color(0x661E2432),
    inverseSurface: AppColors.ink,
    onInverseSurface: AppColors.cream,
    inversePrimary: Color(0xFFFFB4A0),
    surfaceTint: AppColors.coral,
  );

  final textTheme = Typography.material2021().black.apply(
        bodyColor: AppColors.ink,
        displayColor: AppColors.ink,
      );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    brightness: Brightness.light,
    scaffoldBackgroundColor: AppColors.cream,
    splashFactory: InkSparkle.splashFactory,
    textTheme: textTheme,
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.cream,
      foregroundColor: AppColors.ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: AppColors.ink,
        fontSize: 20,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.3,
      ),
    ),
    cardTheme: CardThemeData(
      color: AppColors.surfaceCard,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: const BorderSide(color: AppColors.outlineVariant),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: AppColors.creamContainerHighest,
      selectedColor: AppColors.primaryContainer,
      disabledColor: AppColors.creamContainerHighest.withValues(alpha: 0.5),
      labelStyle: const TextStyle(color: AppColors.ink, fontSize: 13),
      secondaryLabelStyle: const TextStyle(color: AppColors.ink),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(999),
        side: const BorderSide(color: AppColors.outlineVariant),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.coral,
        foregroundColor: Colors.white,
        disabledBackgroundColor: AppColors.creamContainerHighest,
        disabledForegroundColor: AppColors.inkMuted,
        elevation: 0,
        minimumSize: const Size(64, 48),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        textStyle: const TextStyle(
          fontWeight: FontWeight.w700,
          fontSize: 15,
          letterSpacing: 0.2,
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.ink,
        side: const BorderSide(color: AppColors.outline),
        minimumSize: const Size(64, 48),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: AppColors.coralDark,
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.creamContainer,
      hintStyle: const TextStyle(color: AppColors.inkMuted),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(18),
        borderSide: const BorderSide(color: AppColors.outlineVariant),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(18),
        borderSide: const BorderSide(color: AppColors.outlineVariant),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(18),
        borderSide: const BorderSide(color: AppColors.coral, width: 1.6),
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
      contentTextStyle: const TextStyle(color: AppColors.cream),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
    dividerTheme: const DividerThemeData(
      color: AppColors.outlineVariant,
      thickness: 1,
      space: 1,
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: AppColors.coral,
      linearTrackColor: AppColors.creamContainerHighest,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AppColors.surfaceCard,
      indicatorColor: AppColors.primaryContainer,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          fontSize: 12,
          fontWeight: states.contains(WidgetState.selected)
              ? FontWeight.w700
              : FontWeight.w500,
          color: states.contains(WidgetState.selected)
              ? AppColors.ink
              : AppColors.inkMuted,
        ),
      ),
    ),
    textSelectionTheme: const TextSelectionThemeData(
      cursorColor: AppColors.coral,
      selectionColor: Color(0x55F4603A),
      selectionHandleColor: AppColors.coral,
    ),
  );
}
