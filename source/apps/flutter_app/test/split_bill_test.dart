import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/models/bill.dart';
import 'package:flutter_app/models/cart.dart';
import 'package:flutter_app/services/api_service.dart';
import 'package:flutter_app/services/session_service.dart';
import 'package:flutter_app/widgets/refund_section.dart';
import 'package:flutter_app/widgets/split_bill_sheet.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

Map<String, dynamic> billJson({
  String status = 'OPEN',
  bool isOwner = true,
  String myStatus = 'PENDING',
}) => {
  'id': 'bill_1',
  'status': status,
  'currency': 'EUR',
  'totalMinor': 2000,
  'totalFormatted': '€20.00',
  'isOwner': isOwner,
  'items': [
    {'productId': 'coffee', 'name': 'Coffee', 'quantity': 2, 'unitPriceMinor': 1000, 'lineTotalMinor': 2000},
  ],
  'shares': [
    {'id': 's1', 'status': myStatus, 'mine': true, 'participantBound': true, 'participantHash': 'abcd1234', 'amountMinor': 1000, 'amountFormatted': '€10.00'},
    {'id': 's2', 'status': 'PENDING', 'mine': false, 'participantBound': false, 'amountMinor': 1000, 'amountFormatted': '€10.00'},
  ],
  'progress': {'sharesTotal': 2, 'sharesPaid': myStatus == 'PAID' ? 1 : 0, 'sharesWaived': 0, 'paidMinor': 0},
};

MockClient withSession(Future<http.Response> Function(http.Request) handler) {
  return MockClient((request) async {
    if (request.method == 'POST' && request.url.path == '/api/sessions') {
      return http.Response(
        jsonEncode({'sessionId': 'sess-abc', 'sessionToken': 'tok-xyz', 'expiresAt': '2099-01-01T00:00:00.000Z'}),
        201,
      );
    }
    return handler(request);
  });
}

ApiService apiFor(Future<http.Response> Function(http.Request) handler) =>
    ApiService(
      baseUrl: 'http://localhost:3000',
      storage: InMemorySessionStorage(),
      client: withSession(handler),
    );

http.Response jsonResp(Object body, [int status = 200]) => http.Response(
  jsonEncode(body),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

void main() {
  group('Bill models', () {
    test('BillView parses shares, progress and myShare', () {
      final bill = BillView.fromJson(billJson());
      expect(bill.totalFormatted, '€20.00');
      expect(bill.shares, hasLength(2));
      expect(bill.myShare?.id, 's1');
      expect(bill.myShare?.isPaid, isFalse);
      expect(bill.isClosed, isFalse);
      expect(bill.progress.sharesTotal, 2);
    });

    test('settled and cancelled bills are closed', () {
      expect(BillView.fromJson(billJson(status: 'SETTLED')).isClosed, isTrue);
      expect(BillView.fromJson(billJson(status: 'CANCELLED')).isCancelled, isTrue);
    });

    test('extractInviteToken accepts bare token, hash link and query link', () {
      expect(extractInviteToken('  abc.def  '), 'abc.def');
      expect(extractInviteToken('https://x.test/join#t=abc.def'), 'abc.def');
      expect(extractInviteToken('https://x.test/join?t=abc%2Bdef'), 'abc+def');
      expect(extractInviteToken(''), '');
    });
  });

  group('ApiService split bill endpoints', () {
    test('createBill saves wellbeing, then POSTs items + participantCount', () async {
      final seen = <String>[];
      final api = apiFor((request) async {
        seen.add('${request.method} ${request.url.path}');
        if (request.url.path == '/api/wellbeing/preferences') return jsonResp({'ok': true});
        expect(request.url.path, '/api/bills');
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        expect(body['participantCount'], 3);
        expect((body['items'] as List).single['productId'], 'coffee');
        return jsonResp(billJson(), 201);
      });
      final bill = await api.createBill(
        items: [OrderItem(id: 'coffee', quantity: 2)],
        participantCount: 3,
        wellbeingPreferences: const {'diet': 'none'},
      );
      expect(bill.id, 'bill_1');
      expect(seen, ['PUT /api/wellbeing/preferences', 'POST /api/bills']);
    });

    test('joinBill, getBill, invite, pay and cancel hit the right routes', () async {
      final api = apiFor((request) async {
        switch ('${request.method} ${request.url.path}') {
          case 'POST /api/bills/join':
            expect(jsonDecode(request.body)['token'], 'tok');
            return jsonResp({'shareId': 's1', 'bill': billJson(isOwner: false)});
          case 'GET /api/bills/bill_1':
            return jsonResp(billJson());
          case 'POST /api/bills/bill_1/invite':
            return jsonResp({'token': 'tok', 'ttlSeconds': 600, 'joinUrl': '/join#t=tok'});
          case 'POST /api/bills/bill_1/shares/s1/pay':
            return jsonResp({
              'shareId': 's1', 'orderId': 'o1', 'paypalOrderId': 'PP1',
              'approvalUrl': 'https://www.sandbox.paypal.com/checkoutnow?token=PP1',
              'totalMinor': 1000, 'currency': 'EUR', 'status': 'PAYMENT_PENDING',
            }, 201);
          case 'POST /api/bills/bill_1/cancel':
            return jsonResp(billJson(status: 'CANCELLED'));
        }
        return jsonResp({'error': 'unexpected ${request.method} ${request.url.path}'}, 500);
      });
      final joined = await api.joinBill('tok');
      expect(joined.shareId, 's1');
      expect(joined.bill.isOwner, isFalse);
      expect((await api.getBill('bill_1')).id, 'bill_1');
      expect((await api.mintBillInvite('bill_1')).token, 'tok');
      final pay = await api.payBillShare(billId: 'bill_1', shareId: 's1');
      expect(pay.orderId, 'o1');
      expect(pay.approvalUrl, startsWith('https://'));
      expect((await api.cancelBill('bill_1')).isCancelled, isTrue);
    });

    test('server errors surface as ApiException with the server message', () async {
      final api = apiFor((request) async => jsonResp({'error': 'Bill not found'}, 404));
      expect(
        api.getBill('nope'),
        throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 404)),
      );
    });
  });

  group('SplitBillSheet', () {
    Future<void> pumpSheet(
      WidgetTester tester,
      ApiService api, {
      List<OrderItem> items = const [],
      Future<bool> Function(Uri)? launch,
    }) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: SplitBillSheet(
            api: api,
            lang: 'en',
            items: items,
            wellbeingPreferences: const {'diet': 'none'},
            launchApproval: launch,
          ),
        ),
      ));
    }

    testWidgets('empty cart hides create but still offers joining', (tester) async {
      await pumpSheet(tester, apiFor((r) async => jsonResp({})));
      expect(find.byKey(const Key('split-create')), findsNothing);
      expect(find.byKey(const Key('split-join')), findsOneWidget);
    });

    testWidgets('create -> room -> pay opens only an https PayPal link', (tester) async {
      Uri? opened;
      final api = apiFor((request) async {
        switch ('${request.method} ${request.url.path}') {
          case 'PUT /api/wellbeing/preferences':
            return jsonResp({'ok': true});
          case 'POST /api/bills':
            return jsonResp(billJson(), 201);
          case 'POST /api/bills/bill_1/shares/s1/pay':
            return jsonResp({
              'shareId': 's1', 'orderId': 'o1', 'paypalOrderId': 'PP1',
              'approvalUrl': 'https://www.sandbox.paypal.com/checkoutnow?token=PP1',
              'totalMinor': 1000, 'currency': 'EUR',
            }, 201);
        }
        return jsonResp(billJson());
      });
      await pumpSheet(
        tester,
        api,
        items: [OrderItem(id: 'coffee', quantity: 2)],
        launch: (u) async {
          opened = u;
          return true;
        },
      );
      await tester.tap(find.byKey(const Key('split-create')));
      await tester.pumpAndSettle();
      expect(find.text('Total: €20.00'), findsOneWidget);
      expect(find.byKey(const Key('split-pay')), findsOneWidget);

      await tester.tap(find.byKey(const Key('split-pay')));
      await tester.pumpAndSettle();
      expect(opened?.host, 'www.sandbox.paypal.com');
      expect(find.byKey(const Key('split-capture')), findsOneWidget);

      // Dispose the sheet so the 6 s polling timer is cancelled.
      await tester.pumpWidget(const SizedBox.shrink());
    });

    testWidgets('a non-https approval link is rejected and never opened', (tester) async {
      Uri? opened;
      final api = apiFor((request) async {
        if (request.url.path == '/api/bills') return jsonResp(billJson(), 201);
        if (request.url.path.endsWith('/pay')) {
          return jsonResp({'shareId': 's1', 'orderId': 'o1', 'paypalOrderId': 'PP1', 'approvalUrl': 'http://evil.test/x', 'totalMinor': 1000, 'currency': 'EUR'}, 201);
        }
        return jsonResp({'ok': true});
      });
      await pumpSheet(
        tester,
        api,
        items: [OrderItem(id: 'coffee', quantity: 2)],
        launch: (u) async {
          opened = u;
          return true;
        },
      );
      await tester.tap(find.byKey(const Key('split-create')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('split-pay')));
      await tester.pumpAndSettle();
      expect(opened, isNull);
      expect(find.byKey(const Key('split-capture')), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
    });

    testWidgets('a paid share surfaces the customer refund section in the room', (tester) async {
      final paidBill = billJson(myStatus: 'PAID');
      (paidBill['shares'] as List).first['orderId'] = 'o1';
      final api = apiFor((request) async {
        if (request.url.path == '/api/orders/o1/refund-status') {
          return jsonResp({
            'orderId': 'o1',
            'refundableMinor': 1000,
            'currency': 'EUR',
            'refunds': <Object>[],
          });
        }
        return jsonResp(paidBill, 201);
      });
      await pumpSheet(
        tester,
        api,
        items: [OrderItem(id: 'coffee', quantity: 2)],
      );
      await tester.tap(find.byKey(const Key('split-create')));
      await tester.pumpAndSettle();

      expect(find.byType(RefundSection), findsOneWidget);
      expect(find.byKey(const Key('refund-reason')), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  });
}
