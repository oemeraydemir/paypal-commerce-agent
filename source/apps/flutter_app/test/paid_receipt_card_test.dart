import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:qr_flutter/qr_flutter.dart';

import 'package:flutter_app/l10n/app_strings.dart';
import 'package:flutter_app/models/paid_receipt.dart';
import 'package:flutter_app/widgets/paid_receipt_card.dart';

PaidReceipt _receipt({
  ReceiptCartSource source = ReceiptCartSource.ai,
  String? link,
  String? captureId = 'CAPTURE123456',
}) => PaidReceipt(
  orderId: 'order-1',
  captureId: captureId,
  lines: const [
    ReceiptLine(
      productId: 'coffee',
      name: 'Fresh Brewed Coffee',
      quantity: 2,
      lineTotalMinor: 700,
    ),
  ],
  totalFormatted: '€7.00',
  currency: 'EUR',
  source: source,
  paidAt: DateTime(2026, 10, 28, 12, 30),
  verifyLink: link,
);

Future<void> _pump(WidgetTester tester, PaidReceipt receipt, {String lang = 'en'}) {
  return tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: PaidReceiptCard(receipt: receipt, lang: lang),
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('AI-prepared cart: AI row, human row and the no-money row', (tester) async {
    await _pump(tester, _receipt());
    expect(find.text(AppStrings.get('en', 'who.ai')), findsOneWidget);
    expect(find.text(AppStrings.get('en', 'who.you')), findsOneWidget);
    expect(find.text(AppStrings.get('en', 'who.cannot')), findsOneWidget);
    expect(find.text('2× Fresh Brewed Coffee'), findsOneWidget);
    expect(find.text('CAPT••••3456'), findsNothing); // shown inside a longer label
    expect(find.textContaining('CAPT••••3456'), findsOneWidget);
  });

  testWidgets('rule-based cart says "no AI"; manual cart has no assistant row', (tester) async {
    await _pump(tester, _receipt(source: ReceiptCartSource.ruleBased));
    expect(find.text(AppStrings.get('en', 'who.rule')), findsOneWidget);
    expect(find.text(AppStrings.get('en', 'who.ai')), findsNothing);

    await _pump(tester, _receipt(source: ReceiptCartSource.manual));
    expect(find.text(AppStrings.get('en', 'who.ai')), findsNothing);
    expect(find.text(AppStrings.get('en', 'who.rule')), findsNothing);
    expect(find.text(AppStrings.get('en', 'who.you')), findsOneWidget);
    expect(find.text(AppStrings.get('en', 'who.cannot')), findsOneWidget);
  });

  testWidgets('the QR code appears only when a verification link exists', (tester) async {
    await _pump(tester, _receipt());
    expect(find.byType(QrImageView), findsNothing);

    await _pump(tester, _receipt(link: 'https://aicafe.example/verify.html#order-1.SIGNATURE_abcdefghij'));
    expect(find.byType(QrImageView), findsOneWidget);
  });

  testWidgets('no capture id is shown when the server returned none', (tester) async {
    await _pump(tester, _receipt(captureId: null));
    expect(find.textContaining(AppStrings.get('en', 'receipt.captureId')), findsNothing);
  });

  testWidgets('Turkish strings are used for the who-did-what block', (tester) async {
    await _pump(tester, _receipt(), lang: 'tr');
    expect(find.text('Kim ne yaptı'), findsOneWidget);
    expect(find.text(AppStrings.get('tr', 'who.ai')), findsOneWidget);
  });
}
