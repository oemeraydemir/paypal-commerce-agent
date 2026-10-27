import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:flutter_app/l10n/app_strings.dart';
import 'package:flutter_app/providers/locale_provider.dart';
import 'package:flutter_app/utils/quick_replies.dart';
import 'package:flutter_app/widgets/assistant_quick_replies.dart';

const _table = '| Option | Items | Total |\n'
    '| --- | --- | --- |\n'
    '| 1️⃣ Avocado Delight | 2× Vegan Avocado Toast | €17.00 |\n'
    '| 2️⃣ Pancake Treat | 2× Fluffy Pancakes | €18.00 |';

Future<void> _pumpOptions(
  WidgetTester tester, {
  String text = _table,
  String language = 'en',
  ValueChanged<String>? onSelected,
}) async {
  await tester.pumpWidget(
    ChangeNotifierProvider<LocaleProvider>(
      create: (_) => LocaleProvider(language),
      child: MaterialApp(
        home: Scaffold(
          body: AssistantQuickReplies(response: text, onSelected: onSelected),
        ),
      ),
    ),
  );
}

void main() {
  group('Issue 1: explicit option parser', () {
    final cases = <String, List<String>>{
      _table: ['Avocado Delight', 'Pancake Treat'],
      'Option | Items\n--- | ---\n1 | Toast\n2 | Pancakes': ['Toast', 'Pancakes'],
      '| Seçenek | Ürünler |\n| --- | --- |\n| **1. Tost** | 2 tost |\n| **2. Krep** | 2 krep |': ['Tost', 'Krep'],
      'Options:\n1. Toast\n2. Pancakes': ['Toast', 'Pancakes'],
      'Seçenekler:\n1) Tost\n2) Krep': ['Tost', 'Krep'],
      '**Option 1: Toast**\n**Option 2: Pancakes**': ['Toast', 'Pancakes'],
      '1️⃣ Toast\n2️⃣ Pancakes\n3️⃣ Coffee\n4️⃣ Tea': ['Toast', 'Pancakes', 'Coffee', 'Tea'],
      '1. Review cart\n2. Pay with PayPal': [],
      '| Product | Price |\n| --- | --- |\n| 1 Toast | €8 |\n| 2 Coffee | €3 |': [],
      'Options:\n1. Only one': [],
      'Options:\n1. Toast\n3. Pancakes': [],
      'Options:\n1. Toast\n1. Pancakes': [],
      'Options:\n1. A\n2. B\n3. C\n4. D\n5. E': [],
      '```md\nOptions:\n1. Example\n2. Example\n```': [],
      '~~~\n1️⃣ Example\n2️⃣ Example\n~~~': [],
      'No options, just a prepared cart.': [],
    };
    for (final entry in cases.entries) {
      test('recognizes only explicit consecutive options: ${entry.key}', () {
        final options = extractQuickReplies(entry.key);
        expect(options.map((option) => option.label).toList(), entry.value);
        expect(options.map((option) => option.id).toList(),
            List.generate(entry.value.length, (index) => '${index + 1}'));
      });
    }
  });

  testWidgets('tap sends the option number, not the title or the price', (tester) async {
    final selections = <String>[];
    await _pumpOptions(tester, onSelected: selections.add);
    expect(find.byType(ActionChip), findsNWidgets(2));
    await tester.tap(find.byKey(const ValueKey('quick-reply-2')));
    expect(selections, ['2']);
  });

  testWidgets('missing callback disables stale or in-flight choices', (tester) async {
    await _pumpOptions(tester);
    for (final chip in tester.widgetList<ActionChip>(find.byType(ActionChip))) {
      expect(chip.onPressed, isNull);
    }
  });

  testWidgets('ordinary instructions do not render chips', (tester) async {
    await _pumpOptions(tester, text: '1. Review cart\n2. Pay');
    expect(find.byType(ActionChip), findsNothing);
  });

  for (final language in ['en', 'tr']) {
    testWidgets('option hint uses $language localization', (tester) async {
      await _pumpOptions(tester, language: language);
      expect(find.text(AppStrings.get(language, 'options.hint')), findsOneWidget);
    });
  }

  testWidgets('long labels wrap safely at phone width', (tester) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await _pumpOptions(tester,
        text: 'Options:\n1. ${List.filled(20, 'Avocado').join(' ')}\n2. Tea',
        onSelected: (_) {});
    expect(tester.takeException(), isNull);
    expect(find.byType(ActionChip), findsNWidgets(2));
  });
}
