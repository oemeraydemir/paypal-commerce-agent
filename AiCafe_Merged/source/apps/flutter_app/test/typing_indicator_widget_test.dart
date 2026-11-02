import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:flutter_app/widgets/typing_indicator.dart';

void main() {
  testWidgets('animates without error and is labeled as typing', (tester) async {
    final handle = tester.ensureSemantics();
    await tester.pumpWidget(
      const MaterialApp(home: Scaffold(body: Center(child: TypingIndicator()))),
    );

    // Let the repeat animation advance a few frames.
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.byType(TypingIndicator), findsOneWidget);
    expect(find.bySemanticsLabel('AI is typing'), findsOneWidget);

    handle.dispose();
  });

  testWidgets('is a compact row of dots', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: Scaffold(body: Center(child: TypingIndicator()))),
    );

    // Three dot containers are painted (one per typed dot).
    expect(find.byType(Opacity), findsNWidgets(3));
  });
}
