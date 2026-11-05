import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/models/refund.dart';
import 'package:flutter_app/models/pickup.dart';
import 'package:flutter_app/services/api_service.dart';
import 'package:flutter_app/services/session_service.dart';
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
  group('ApiService refund + pickup endpoints', () {
    test('fetchRefundStatus parses a customer-safe refund status view', () async {
      final api = ApiService(
        baseUrl: 'http://localhost:3000',
        storage: InMemorySessionStorage(),
        client: withSession((request) async {
          expect(request.method, 'GET');
          expect(request.url.path, '/api/orders/order-1/refund-status');
          return http.Response(
            jsonEncode({
              'orderId': 'order-1',
              'refundableMinor': 250,
              'currency': 'EUR',
              'refunds': [
                {
                  'id': 'r-1',
                  'status': 'UNDER_REVIEW',
                  'amountMinor': 250,
                  'currency': 'EUR',
                  'requestedAt': '2026-01-01T10:00:00.000Z',
                  'decidedAt': null,
                },
              ],
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      );

      final status = await api.fetchRefundStatus('order-1');
      expect(status.orderId, 'order-1');
      expect(status.refundableMinor, 250);
      expect(status.currency, 'EUR');
      expect(status.canRequest, isFalse); // active request already exists
      expect(status.hasActiveRequest, isTrue);
      expect(status.refunds.single.status, 'UNDER_REVIEW');
      expect(status.refunds.single.amountMinor, 250);
    });

    test('requestRefund POSTs the reason and optional note', () async {
      final api = ApiService(
        baseUrl: 'http://localhost:3000',
        storage: InMemorySessionStorage(),
        client: withSession((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/api/orders/order-1/refund-request');
          expect(jsonDecode(request.body), {
            'reason': 'wrong_item',
            'note': 'Damaged on arrival',
          });
          return http.Response(
            jsonEncode({
              'id': 'r-1',
              'status': 'UNDER_REVIEW',
              'amountMinor': 250,
              'currency': 'EUR',
              'requestedAt': '2026-01-01T10:00:00.000Z',
              'decidedAt': null,
            }),
            201,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      );

      final view = await api.requestRefund(
        orderId: 'order-1',
        reason: 'wrong_item',
        note: 'Damaged on arrival',
      );
      expect(view.status, 'UNDER_REVIEW');
      expect(view.amountMinor, 250);
    });

    test('fetchPickupAvailability parses server-computed slots', () async {
      final api = ApiService(
        baseUrl: 'http://localhost:3000',
        storage: InMemorySessionStorage(),
        client: withSession((request) async {
          expect(request.method, 'GET');
          expect(request.url.path, '/api/pickup/availability');
          return http.Response(
            jsonEncode({
              'day': '2026-01-02',
              'slots': [
                {
                  'id': 'slot-1',
                  'day': '2026-01-02',
                  'startTs': '2026-01-02T09:00:00.000Z',
                  'endTs': '2026-01-02T09:30:00.000Z',
                  'capacity': 5,
                  'reservedCount': 2,
                  'remaining': 3,
                },
                {
                  'id': 'slot-2',
                  'day': '2026-01-02',
                  'startTs': '2026-01-02T10:00:00.000Z',
                  'endTs': '2026-01-02T10:30:00.000Z',
                  'capacity': 1,
                  'reservedCount': 1,
                  'remaining': 0,
                },
              ],
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      );

      final List<PickupSlot> slots = await api.fetchPickupAvailability();
      expect(slots, hasLength(2));
      expect(slots.first.remaining, 3);
      expect(slots.first.isFull, isFalse);
      expect(slots.last.isFull, isTrue);
    });

    test('reservePickupSlot POSTs the slotId and returns a HELD booking', () async {
      final api = ApiService(
        baseUrl: 'http://localhost:3000',
        storage: InMemorySessionStorage(),
        client: withSession((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/api/pickup/reserve');
          expect(jsonDecode(request.body), {'slotId': 'slot-1'});
          return http.Response(
            jsonEncode({
              'bookingId': 'bk-1',
              'slotId': 'slot-1',
              'status': 'HELD',
            }),
            201,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      );

      final booking = await api.reservePickupSlot('slot-1');
      expect(booking.bookingId, 'bk-1');
      expect(booking.status, 'HELD');
    });

    test('linkPickupBooking POSTs bookingId + orderId', () async {
      final api = ApiService(
        baseUrl: 'http://localhost:3000',
        storage: InMemorySessionStorage(),
        client: withSession((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/api/pickup/link');
          expect(jsonDecode(request.body), {
            'bookingId': 'bk-1',
            'orderId': 'order-1',
          });
          return http.Response(
            jsonEncode({
              'bookingId': 'bk-1',
              'orderId': 'order-1',
              'status': 'CONFIRMED',
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      );

      final booking = await api.linkPickupBooking(
        bookingId: 'bk-1',
        orderId: 'order-1',
      );
      expect(booking.status, 'CONFIRMED');
    });

    test('releasePickupBooking POSTs bookingId', () async {
      final api = ApiService(
        baseUrl: 'http://localhost:3000',
        storage: InMemorySessionStorage(),
        client: withSession((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/api/pickup/release');
          expect(jsonDecode(request.body), {'bookingId': 'bk-1'});
          return http.Response(
            jsonEncode({'bookingId': 'bk-1', 'status': 'RELEASED'}),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      );

      await api.releasePickupBooking('bk-1');
    });

    test('transport guard converts a raw ClientException into ApiException', () async {
      final api = ApiService(
        baseUrl: 'http://localhost:3000',
        storage: InMemorySessionStorage(),
        client: withSession((request) async {
          // Bypass the happy path; the health endpoint hits the raw transport.
          throw http.ClientException('connection failed');
        }),
      );

      await expectLater(
        api.getHealth(),
        throwsA(
          isA<ApiException>().having((e) => e.retryable, 'retryable', isTrue),
        ),
      );
    });

    test('RefundStatusView.canRequest is true when no active request', () {
      const view = RefundStatusView(
        orderId: 'o-1',
        refundableMinor: 500,
        currency: 'EUR',
        refunds: [],
      );
      expect(view.canRequest, isTrue);
      expect(view.hasActiveRequest, isFalse);
    });
  });
}
