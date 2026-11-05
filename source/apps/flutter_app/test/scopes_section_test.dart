import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:flutter_app/services/api_service.dart';
import 'package:flutter_app/services/session_service.dart';
import 'package:flutter_app/widgets/scopes_section.dart';

MockClient withSession(Future<http.Response> Function(http.Request) handler) {
  return MockClient((request) async {
    if (request.method == 'POST' && request.url.path == '/api/sessions') {
      return http.Response(
        jsonEncode({
          'sessionId': 'sess-abc',
          'sessionToken': 'tok-xyz',
          'expiresAt': '2099-01-01T00:00:00.000Z',
        }),
        201,
      );
    }
    return handler(request);
  });
}

Map<String, dynamic> scope({
  String id = 'sc-1',
  String status = 'ACTIVE',
  String kind = 'SHOPPER',
}) =>
    <String, dynamic>{
      'id': id,
      'kind': kind,
      'label': 'Barista cart budget',
      'sessionRef': 'sess_abc123',
      'originsAllowed': <String>['human'],
      'currency': 'EUR',
      'maxPerPurchaseMinor': 5000,
      'dailySpendLimitMinor': 20000,
      'categorySpendLimits': null,
      'allowedMerchantIds': null,
      'nightWindow': null,
      'status': status,
      'issuedBy': 'HUMAN',
      'approvedBy': null,
      'createdAt': '2026-11-04T08:00:00.000Z',
      'expiresAt': null,
      'updatedAt': '2026-11-04T08:00:00.000Z',
    };

Widget wrap(ApiService api) {
  return MaterialApp(
    home: Scaffold(body: SingleChildScrollView(child: ScopesSection(api: api, lang: 'en'))),
  );
}

void main() {
  testWidgets('renders scopes, shows status, and handles approve/revoke + create', (tester) async {
    final approve = <String>[];
    final revoke = <String>[];
    final api = ApiService(
      baseUrl: 'http://localhost:3000',
      storage: InMemorySessionStorage(),
      client: withSession((request) async {
        if (request.method == 'GET' && request.url.path == '/api/policy/scopes') {
          return http.Response(
            jsonEncode({
              'scopes': [
                scope(id: 'sc-active'),
                scope(id: 'sc-pending', status: 'PENDING_APPROVAL', kind: 'AGENT_PROPOSED'),
              ],
            }),
            200,
          );
        }
        if (request.method == 'POST' && request.url.path.endsWith('/approve')) {
          approve.add(request.url.path);
          return http.Response(jsonEncode({'scope': scope(id: 'sc-pending', status: 'ACTIVE')}), 200);
        }
        if (request.method == 'POST' && request.url.path.endsWith('/revoke')) {
          revoke.add(request.url.path);
          return http.Response(jsonEncode({'scope': scope(id: 'sc-active', status: 'REVOKED')}), 200);
        }
        if (request.method == 'POST' && request.url.path == '/api/policy/scopes') {
          return http.Response(jsonEncode({'scope': scope(id: 'sc-new'), 'pending': false}), 201);
        }
        return http.Response('{}', 404);
      }),
    );

    await tester.pumpWidget(wrap(api));
    // Initial load.
    expect(find.text('Scoped allowances'), findsOneWidget);
    await tester.pumpAndSettle();
    // Both scopes render.
    expect(find.text('Barista cart budget'), findsNWidgets(2));
    // Active scope shows a Revoke button; pending shows Approve.
    expect(find.text('Revoke'), findsOneWidget);
    expect(find.text('Approve'), findsOneWidget);
    // Daily limit text appears.
    expect(find.textContaining('€200.00'), findsWidgets);

    // Create a scope. The form sits below the fold of the 800x600 test surface,
    // so scroll it into view before tapping (otherwise the tap misses).
    await tester.enterText(find.byType(TextField).first, 'My allowance');
    await tester.enterText(find.byType(TextField).last, '10');
    await tester.ensureVisible(find.text('Create'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Create'));
    await tester.pumpAndSettle();
    expect(find.text('Scoped allowance created.'), findsOneWidget);

    // Approve the pending scope.
    await tester.ensureVisible(find.text('Approve'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Approve'));
    await tester.pumpAndSettle();
    expect(approve.length, 1);
    expect(approve.single, endsWith('/sc-pending/approve'));

    // Revoke the active scope (confirm dialog).
    await tester.ensureVisible(find.text('Revoke').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Revoke').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Revoke').last);
    await tester.pumpAndSettle();
    expect(revoke.length, 1);
    expect(revoke.single, endsWith('/sc-active/revoke'));
  });

  testWidgets('shows empty state when no scopes exist', (tester) async {
    final api = ApiService(
      baseUrl: 'http://localhost:3000',
      storage: InMemorySessionStorage(),
      client: withSession((request) async {
        if (request.method == 'GET' && request.url.path == '/api/policy/scopes') {
          return http.Response(jsonEncode({'scopes': <dynamic>[]}), 200);
        }
        return http.Response('{}', 404);
      }),
    );
    await tester.pumpWidget(wrap(api));
    await tester.pumpAndSettle();
    expect(find.text('No scoped allowances yet.'), findsOneWidget);
  });
}
