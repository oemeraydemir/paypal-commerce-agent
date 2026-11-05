import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/models/pickup.dart';
import 'package:flutter_app/services/api_service.dart';
import 'package:flutter_app/services/session_service.dart';
import 'package:flutter_app/widgets/pickup_planner.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Mirrors `withSession` in api_service_test.dart: `POST /api/sessions` always
/// returns a valid session so authenticated requests can proceed.
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

void main() {
  testWidgets(
      'reserving a slot dismisses the planner sheet and returns to the checkout screen',
      (tester) async {
    final api = ApiService(
      baseUrl: 'http://localhost:3000',
      storage: InMemorySessionStorage(),
      client: withSession((request) async {
        if (request.method == 'GET' && request.url.path == '/api/pickup/availability') {
          return http.Response(
            jsonEncode({
              'slots': [
                {
                  'id': 'slot-1',
                  'day': '2026-11-03',
                  'startTs': '2026-11-03T10:00:00.000Z',
                  'endTs': '2026-11-03T11:00:00.000Z',
                  'capacity': 5,
                  'reservedCount': 1,
                  'remaining': 4,
                },
              ],
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        if (request.method == 'POST' && request.url.path == '/api/pickup/reserve') {
          return http.Response(
            jsonEncode({
              'bookingId': 'bk-1',
              'slotId': 'slot-1',
              'status': 'HELD',
            }),
            201,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return http.Response('{"error":"not found"}', 404);
      }),
    );

    PickupBooking? lastBooking;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (ctx) => Center(
              child: ElevatedButton(
                onPressed: () => Navigator.of(ctx).push(
                  MaterialPageRoute(
                    builder: (_) => Scaffold(
                      body: PickupPlannerSheet(
                        api: api,
                        lang: 'en',
                        onBookingChanged: (booking) => lastBooking = booking,
                      ),
                    ),
                  ),
                ),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    );

    // Open the planner sheet.
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(find.byType(PickupPlannerSheet), findsOneWidget);
    expect(find.text('Reserve'), findsWidgets);

    // Reserve the available slot.
    await tester.tap(find.widgetWithText(OutlinedButton, 'Reserve').first);
    await tester.pumpAndSettle();

    // The sheet should be dismissed, returning to the underlying checkout screen.
    expect(find.byType(PickupPlannerSheet), findsNothing);
    expect(find.text('open'), findsOneWidget);
    expect(lastBooking?.bookingId, 'bk-1');
    expect(lastBooking?.status, 'HELD');
  });
}
