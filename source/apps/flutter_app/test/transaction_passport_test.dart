import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:flutter_app/l10n/app_strings.dart';
import 'package:flutter_app/models/cart.dart';
import 'package:flutter_app/models/transaction_passport.dart';
import 'package:flutter_app/widgets/transaction_passport_card.dart';

Map<String, dynamic> _json({String decision = 'REQUIRE_CONFIRMATION'}) => {
  'kind': 'transaction-passport',
  'isPaymentRecord': false,
  'totalMinor': 1300,
  'currency': 'EUR',
  'lines': [
    {'productId': 'a', 'name': 'Vegetarian Breakfast', 'quantity': 1, 'unitPriceMinor': 1000, 'lineTotalMinor': 1000},
    {'productId': 'b', 'name': 'Fresh Brewed Coffee', 'quantity': 1, 'unitPriceMinor': 300, 'lineTotalMinor': 300},
  ],
  'mandate': {
    'maxPerPurchaseMinor': 2000,
    'approvalThresholdMinor': 1000,
    'cartMinor': 1300,
    'remainingMinor': 700,
    'usedPercent': 65,
    'thresholdPercent': 50,
    'dailyRemainingMinor': 10000,
    'aiCanChangeLimit': false,
  },
  'control': {
    'decision': decision,
    'withinLimit': true,
    'requiresShopperApproval': true,
    'paymentAuthority': 'shopper',
    'agentCanPay': false,
  },
  'checks': [],
  'steps': [
    {'key': 'prepared', 'state': 'done', 'actor': 'ai'},
    {'key': 'prices', 'state': 'done', 'actor': 'server'},
    {'key': 'limit', 'state': 'done', 'actor': 'server'},
    {'key': 'approval', 'state': 'pending', 'actor': 'shopper'},
    {'key': 'paypal', 'state': 'pending', 'actor': 'paypal'},
    {'key': 'verify', 'state': 'pending', 'actor': 'server'},
  ],
  'notices': ['sample-menu-data', 'sandbox-only'],
};

Map<String, dynamic> _blockedJson() {
  final j = _json(decision: 'BLOCK');
  j['totalMinor'] = 2500;
  (j['mandate'] as Map)['usedPercent'] = 100;
  (j['mandate'] as Map)['remainingMinor'] = -500;
  final c = j['control'] as Map;
  c['withinLimit'] = false;
  c['requiresShopperApproval'] = false;
  for (final s in j['steps'] as List) {
    if (s['key'] == 'limit' || s['key'] == 'approval' || s['key'] == 'paypal' || s['key'] == 'verify') {
      s['state'] = 'blocked';
    }
  }
  return j;
}

Future<void> _pump(WidgetTester tester, TransactionPassport p, {String lang = 'en'}) {
  return tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(child: TransactionPassportCard(passport: p, lang: lang)),
      ),
    ),
  );
}

void main() {
  group('TransactionPassport.tryParse', () {
    test('parses the server contract (enriched fields + productId)', () {
      final p = TransactionPassport.tryParse(_json())!;
      expect(p.totalMinor, 1300);
      expect(p.lines, hasLength(2));
      // canonical line data is preserved
      expect(p.lines[0].productId, 'a');
      expect(p.lines[0].name, 'Vegetarian Breakfast');
      expect(p.lines[0].unitPriceMinor, 1000);
      expect(p.lines[0].lineTotalMinor, 1000);
      expect(p.mandate.maxPerPurchaseMinor, 2000);
      expect(p.mandate.approvalThresholdMinor, 1000);
      expect(p.mandate.thresholdPercent, 50);
      expect(p.steps.map((s) => s.actor), ['ai', 'server', 'server', 'shopper', 'paypal', 'server']);
      expect(p.paymentAuthority, 'shopper');
      expect(p.agentCanPay, isFalse);
      expect(p.isBlocked, isFalse);
    });

    test('payment authority is never taken from the payload', () {
      final j = _json();
      (j['control'] as Map)['paymentAuthority'] = 'agent';
      expect(TransactionPassport.tryParse(j)!.paymentAuthority, 'shopper');
    });

    test('BLOCK decision is reflected in isBlocked', () {
      final p = TransactionPassport.tryParse(_blockedJson())!;
      expect(p.isBlocked, isTrue);
      expect(p.withinLimit, isFalse);
      expect(p.steps.where((s) => s.state == 'blocked').length, 4);
    });

    test('returns null for anything that is not a transaction passport', () {
      expect(TransactionPassport.tryParse(null), isNull);
      expect(TransactionPassport.tryParse('x'), isNull);
      expect(TransactionPassport.tryParse({'kind': 'other'}), isNull);
      expect(TransactionPassport.tryParse({'kind': 'transaction-passport'}), isNull);
    });

    test('tryParse reads the server numbers and clamps the usage percent', () {
      final p = TransactionPassport.tryParse(_json())!;
      expect(p.totalMinor, 1300);
      expect(p.mandate.remainingMinor, 700);
      expect(p.mandate.usedPercent, 65);
      expect(p.withinLimit, isTrue);
      expect(p.steps.length, 6);
      final over = _json();
      (over['mandate'] as Map)['usedPercent'] = 250;
      expect(TransactionPassport.tryParse(over)!.mandate.usedPercent, 100);
    });
  });

  group('TransactionPassportCard', () {
    testWidgets('shows who acts, the limit bar marker and that you hold payment authority', (tester) async {
      await _pump(tester, TransactionPassport.tryParse(_json())!);
      expect(find.text('AI Transaction Passport'), findsOneWidget);
      expect(find.text('€13.00'), findsOneWidget);
      expect(find.byKey(const Key('passport-threshold-marker')), findsOneWidget);
      expect(find.byKey(const Key('passport-authority')), findsOneWidget);
      expect(find.text('AI'), findsOneWidget);
      expect(find.text('PayPal'), findsWidgets);
      expect(find.text('The AI cannot change your limit'), findsWidgets);
    });

    testWidgets('renders in Turkish', (tester) async {
      await _pump(tester, TransactionPassport.tryParse(_json())!, lang: 'tr');
      expect(find.text('AI İşlem Pasaportu'), findsOneWidget);
    });

    testWidgets('blocked cart says payment cannot start and uses Turkish strings', (tester) async {
      await _pump(tester, TransactionPassport.tryParse(_blockedJson())!, lang: 'tr');
      expect(find.textContaining(AppStrings.get('tr', 'passport.over')), findsOneWidget);
      expect(find.textContaining(AppStrings.get('tr', 'passport.wait')), findsNothing);
    });
  });

  group('PolicyPreview keeps the passport', () {
    test('tolerates its absence (older server)', () {
      final withP = PolicyPreview.fromJson({
        'empty': false,
        'decision': 'REQUIRE_CONFIRMATION',
        'totalMinor': 1300,
        'limits': {'maxPerPurchaseMinor': 2000, 'currency': 'EUR'},
        'passport': _json(),
      });
      expect(withP.passport, isNotNull);
      final without = PolicyPreview.fromJson({
        'empty': false,
        'decision': 'AUTO_ALLOW',
        'limits': {'maxPerPurchaseMinor': 2000},
      });
      expect(without.passport, isNull);
    });
  });

  test('every passport key exists in both languages', () {
    const keys = [
      'title', 'sub', 'why', 'why1', 'why2', 'why3', 'control', 'within', 'over', 'nochange', 'wait',
      'authority', 'you', 'flow', 's.prepared', 's.prices', 's.limit', 's.approval', 's.paypal',
      's.verify', 'n.sample', 'n.allergen', 'n.sandbox', 'preview', 'used', 'threshold',
      'actor.ai', 'actor.server', 'actor.shopper', 'actor.paypal',
    ];
    for (final k in keys) {
      for (final lang in ['en', 'tr']) {
        expect(AppStrings.get(lang, 'passport.$k'), isNot('passport.$k'), reason: '$lang passport.$k');
      }
    }
  });
}
