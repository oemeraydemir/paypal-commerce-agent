import 'package:flutter_test/flutter_test.dart';

import 'package:flutter_app/models/chat_message.dart';
import 'package:flutter_app/models/paid_receipt.dart';

PaidReceipt _receipt({ReceiptCartSource source = ReceiptCartSource.ai}) =>
    PaidReceipt(
      orderId: 'order-1',
      captureId: 'CAPTURE123456',
      lines: const [
        ReceiptLine(productId: 'coffee', name: 'Fresh Brewed Coffee', quantity: 1),
      ],
      totalFormatted: '€3.50',
      totalMinor: 350,
      currency: 'EUR',
      source: source,
      paidAt: DateTime(2026, 10, 28, 12, 30),
    );

void main() {
  group('receiptSourceFor', () {
    test('an AI reply that prepared a cart is AI', () {
      expect(
        receiptSourceFor(hadPreparedCart: true, mode: ChatMode.ai),
        ReceiptCartSource.ai,
      );
    });
    test('a rule-based cart is never presented as AI', () {
      expect(
        receiptSourceFor(hadPreparedCart: true, mode: ChatMode.ruleBased),
        ReceiptCartSource.ruleBased,
      );
    });
    test('a hand-built cart has no assistant at all', () {
      expect(
        receiptSourceFor(hadPreparedCart: false, mode: ChatMode.ai),
        ReceiptCartSource.manual,
      );
    });
  });

  group('MandateSummary.tryParse', () {
    test('reads signature, order, items and total', () {
      final m = MandateSummary.tryParse({
        'signature': 'sig_abcdefghijklmnopqrstuvwxyz',
        'mandate': {
          'orderId': 'order-1',
          'currency': 'EUR',
          'totalMinor': 350,
          'items': [
            {'productId': 'coffee', 'quantity': 1, 'lineTotalMinor': 350},
          ],
        },
      });
      expect(m, isNotNull);
      expect(m!.orderId, 'order-1');
      expect(m.totalMinor, 350);
      expect(m.lines.single.lineTotalMinor, 350);
    });

    test('a missing or malformed payload gives null instead of throwing', () {
      expect(MandateSummary.tryParse(null), isNull);
      expect(MandateSummary.tryParse('x'), isNull);
      expect(MandateSummary.tryParse({'mandate': {}}), isNull);
      expect(MandateSummary.tryParse({'signature': '', 'mandate': {}}), isNull);
      expect(
        MandateSummary.tryParse({
          'signature': 'abc',
          'mandate': {'items': []},
        }),
        isNull,
      );
    });
  });

  group('PaidReceipt', () {
    test('withMandate fills prices and builds the verification link', () {
      final updated = _receipt().withMandate(
        const MandateSummary(
          orderId: 'order-1',
          signature: 'SIG_xyz-123',
          totalMinor: 350,
          currency: 'EUR',
          lines: [
            ReceiptLine(productId: 'coffee', quantity: 1, lineTotalMinor: 350),
          ],
        ),
        'https://aicafe.example/',
      );
      expect(updated.verifyLink, 'https://aicafe.example/verify.html#order-1.SIG_xyz-123');
      expect(updated.lines.single.lineTotalMinor, 350);
      // The name the chat already knew survives the merge.
      expect(updated.lines.single.name, 'Fresh Brewed Coffee');
      expect(updated.captureId, 'CAPTURE123456');
    });

    test('without a mandate there is simply no link', () {
      expect(_receipt().verifyLink, isNull);
    });
  });

  test('capture ids are masked, short ones fully hidden', () {
    expect(maskCaptureId('CAPTURE123456'), 'CAPT••••3456');
    expect(maskCaptureId('abc'), '••••');
  });

  test('link builder strips trailing slashes', () {
    expect(mandateVerifyLink('http://x///', 'o', 's'), 'http://x/verify.html#o.s');
  });
}
