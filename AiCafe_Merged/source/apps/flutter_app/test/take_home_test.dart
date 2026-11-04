import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:flutter_app/l10n/app_strings.dart';
import 'package:flutter_app/models/take_home.dart';
import 'package:flutter_app/widgets/take_home_card.dart';

Future<void> _pump(
  WidgetTester tester,
  Future<TakeHomeResult> Function() load, {
  Future<void> Function(Uri)? onOpen,
}) {
  return tester.pumpWidget(
    MaterialApp(
      home: Scaffold(body: SingleChildScrollView(child: TakeHomeCard(lang: 'en', load: load, onOpen: onOpen))),
    ),
  );
}

void main() {
  test('only https links with id and title are accepted', () {
    expect(TakeHomeItem.tryParse({'id': 'a', 'title': 'Beans', 'url': 'https://shop.example/b'}), isNotNull);
    expect(TakeHomeItem.tryParse({'id': 'a', 'title': 'Beans', 'url': 'http://shop.example/b'}), isNull);
    expect(TakeHomeItem.tryParse({'id': 'a', 'title': 'Beans', 'url': 'javascript:alert(1)'}), isNull);
    expect(TakeHomeItem.tryParse({'title': 'No id', 'url': 'https://x.example'}), isNull);
    expect(TakeHomeItem.tryParse('x'), isNull);
  });

  test('result drops unsafe items and reads the enabled flag', () {
    final r = TakeHomeResult.fromJson({
      'enabled': true,
      'items': [
        {'id': 'a', 'title': 'Beans', 'url': 'https://shop.example/b', 'price': 12, 'currency': 'EUR'},
        {'id': 'b', 'title': 'Bad', 'url': 'http://insecure.example'},
      ],
    });
    expect(r.enabled, isTrue);
    expect(r.items.length, 1);
    expect(TakeHomeResult.fromJson({'enabled': false}).items, isEmpty);
  });

  testWidgets('nothing is requested until the button is tapped; items and disclosure then appear', (tester) async {
    var calls = 0;
    Uri? opened;
    await _pump(
      tester,
      () async {
        calls++;
        return const TakeHomeResult(
          enabled: true,
          items: [TakeHomeItem(id: 'a', title: 'Beans 1kg', url: 'https://shop.example/b', merchantDomain: 'shop.example')],
        );
      },
      onOpen: (u) async => opened = u,
    );
    expect(calls, 0);
    await tester.tap(find.byKey(const Key('take-home-load')));
    await tester.pumpAndSettle();
    expect(calls, 1);
    expect(find.text('Beans 1kg'), findsOneWidget);
    expect(find.text(AppStrings.get('en', 'takehome.disclosure')), findsOneWidget);
    await tester.tap(find.text('Beans 1kg'));
    await tester.pump();
    expect(opened.toString(), 'https://shop.example/b');
  });

  testWidgets('disabled server and failures are shown honestly', (tester) async {
    await _pump(tester, () async => const TakeHomeResult(enabled: false, items: []));
    await tester.tap(find.byKey(const Key('take-home-load')));
    await tester.pumpAndSettle();
    expect(find.text(AppStrings.get('en', 'takehome.off')), findsOneWidget);

    // Unmount the previous card so the next pump starts from a fresh idle state.
    // Without this, Flutter reuses the card's State (phase stays "off") and the
    // `take-home-load` button is gone, so the tap below would find nothing.
    await tester.pumpWidget(const SizedBox.shrink());
    await _pump(tester, () async => throw Exception('boom'));
    await tester.tap(find.byKey(const Key('take-home-load')));
    await tester.pumpAndSettle();
    expect(find.text(AppStrings.get('en', 'takehome.error')), findsOneWidget);
  });
}
