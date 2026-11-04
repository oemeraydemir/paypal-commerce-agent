import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:flutter_app/providers/locale_provider.dart';
import 'package:flutter_app/providers/shopper_profile_provider.dart';
import 'package:flutter_app/screens/profile_screen.dart';

void main() {
  testWidgets(
      'ProfileScreen renders preferences, AI+PayPal guides and the merchant section',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final locale = LocaleProvider('en');
    final profile = ShopperProfileProvider();

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<LocaleProvider>.value(value: locale),
          ChangeNotifierProvider<ShopperProfileProvider>.value(value: profile),
        ],
        child: MaterialApp(home: const ProfileScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Your shopping profile'), findsOneWidget);
    expect(find.text('Use the café better with AI + PayPal'), findsOneWidget);
    expect(find.text('Edit my preferences'), findsOneWidget);

    // The merchant section renders below the fold; scroll down to it.
    await tester.scrollUntilVisible(
      find.text('For café owners: add PayPal'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('For café owners: add PayPal'), findsOneWidget);
    expect(tester.takeException(), isNull);

    profile.dispose();
    locale.dispose();
  });
}
