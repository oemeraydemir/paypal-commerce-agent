import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/services/api_service.dart';
import 'package:flutter_app/models/shopper_preferences.dart';
import 'package:flutter_app/services/session_service.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Mirrors the `withSession` helper in api_service_test: answers `POST /api/sessions`
/// so authenticated requests can proceed, then delegates everything else.
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
  group('ApiService.syncGuard', () {
    test('PUTs the Wellbeing Guard payload with server-mapped allergen keys', () async {
      Map<String, dynamic> sentBody = {};
      String method = '';
      String path = '';

      final api = ApiService(
        baseUrl: 'http://localhost:3000',
        storage: InMemorySessionStorage(),
        client: withSession((request) async {
          method = request.method;
          path = request.url.path;
          sentBody = jsonDecode(request.body) as Map<String, dynamic>;
          return http.Response(
            jsonEncode({'guard': {}, 'enforcedBy': 'server'}),
            200,
          );
        }),
      );

      final ok = await api.syncGuard(const ShopperPreferences(
        dietary: {'vegan', 'gluten-free'},
        allergens: {'peanut', 'tree-nut', 'fish'},
      ));

      expect(ok, isTrue);
      expect(method, 'PUT');
      expect(path, '/api/guard');
      expect(sentBody['diets'], ['gluten-free', 'vegan']);
      // peanut -> peanuts, tree-nut -> nuts; fish passes through unchanged.
      expect(
        Set<String>.from(sentBody['allergens'] as List),
        {'peanuts', 'nuts', 'fish'},
      );
      api.dispose();
    });

    test('empty preferences make NO HTTP call and return true (never wipe a server guard)', () async {
      var calls = 0;
      final api = ApiService(
        baseUrl: 'http://localhost:3000',
        storage: InMemorySessionStorage(),
        client: withSession((request) async {
          calls++;
          return http.Response('ok', 200);
        }),
      );

      // On startup a not-yet-loaded / empty local profile must NOT push an empty
      // guard to the server — that would delete the shopper's existing guard.
      final ok = await api.syncGuard(ShopperPreferences.empty);

      expect(ok, isTrue);
      expect(calls, 0);
      api.dispose();
    });

    test('returns false on a non-2xx response (best-effort, no throw)', () async {
      final api = ApiService(
        baseUrl: 'http://localhost:3000',
        storage: InMemorySessionStorage(),
        client: withSession(
          (request) async => http.Response('bad request', 400),
        ),
      );

      final ok = await api.syncGuard(const ShopperPreferences(dietary: {'vegan'}));
      expect(ok, isFalse);
      api.dispose();
    });
  });
}
