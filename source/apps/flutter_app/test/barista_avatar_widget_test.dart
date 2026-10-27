import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:flutter_app/widgets/barista_avatar.dart';

void main() {
  testWidgets('renders the Coco barista avatar with an accessible label', (tester) async {
    final handle = tester.ensureSemantics();
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: Center(child: BaristaAvatar())),
      ),
    );

    expect(find.byType(BaristaAvatar), findsOneWidget);
    expect(find.bySemanticsLabel('Coco, AI barista'), findsOneWidget);

    handle.dispose();
  });

  testWidgets('respects a custom size', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: Center(child: BaristaAvatar(size: 56))),
      ),
    );

    final size = tester.getSize(find.byType(BaristaAvatar));
    expect(size.width, 56);
    expect(size.height, 56);
  });
}
