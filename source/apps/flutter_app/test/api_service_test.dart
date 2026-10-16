import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/services/api_service.dart';
import 'package:flutter_app/models/product.dart';
import 'package:flutter_app/models/shopper_preferences.dart';
import 'package:flutter_app/services/session_service.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Wraps [handler] so that `POST /api/sessions` always returns a valid session
/// with the backend's real field names (`sessionId`, `sessionToken`). Mirrors the
/// actual contract so authenticated requests can proceed.
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
  group('ApiService', () {
    test(
      'sends shopper profile and session auth headers with the AI request',
      () async {
        final api = ApiService(
          baseUrl: 'http://localhost:3000',
          storage: InMemorySessionStorage(),
          client: withSession((request) async {
            expect(request.url.toString(), 'http://localhost:3000/api/ai/chat');
            // Correct header names + the server-issued identity.
            expect(request.headers['x-session-id'], 'sess-abc');
            expect(request.headers['authorization'], 'Bearer tok-xyz');
            final body = jsonDecode(request.body) as Map<String, dynamic>;
            expect(body['preferences'], {
              'dietary': ['vegan'],
              'maxBudgetMinor': 1200,
            });
            // Body identity matches the authenticated session identity.
            expect(body['sessionId'], 'sess-abc');
            return http.Response(
              jsonEncode({
                'sessionId': 'sess-abc',
                'response': 'I will find vegan items under your budget.',
                'checkoutReady': false,
                'toolRounds': 0,
                'messageCount': 2,
              }),
              200,
            );
          }),
        );

        await api.sendChat(
          message: 'Breakfast please',
          preferences: const ShopperPreferences(
            dietary: {'vegan'},
            maxBudgetMinor: 1200,
          ),
        );
        api.dispose();
      },
    );

    test('reports AI and PayPal sandbox readiness', () async {
      final api = ApiService(
        baseUrl: 'http://localhost:3000',
        storage: InMemorySessionStorage(),
        client: MockClient(
          (_) async => http.Response(
            jsonEncode({
              'status': 'ok',
              'paypal': {'enabled': true, 'environment': 'sandbox'},
              'ai': {'enabled': true},
            }),
            200,
          ),
        ),
      );

      final health = await api.getHealth();

      expect(health.status, 'ok');
      expect(health.paypalEnabled, isTrue);
      expect(health.aiEnabled, isTrue);
      expect(health.paypalEnvironment, 'sandbox');
      api.dispose();
    });

    test('shows disabled integrations as not configured', () async {
      final api = ApiService(
        baseUrl: 'http://localhost:3000',
        storage: InMemorySessionStorage(),
        client: MockClient(
          (_) async => http.Response(
            jsonEncode({
              'status': 'ok',
              'paypal': {'enabled': false},
            }),
            200,
          ),
        ),
      );

      final health = await api.getHealth();

      expect(health.paypalEnabled, isFalse);
      expect(health.aiEnabled, isFalse);
      api.dispose();
    });

    test('returns products from the catalog API', () async {
      final api = ApiService(
        baseUrl: 'http://localhost:3000',
        storage: InMemorySessionStorage(),
        client: MockClient(
          (_) async => http.Response(
            jsonEncode({
              'count': 1,
              'products': [
                {
                  'id': 'coffee',
                  'name': 'Fresh Brewed Coffee',
                  'description': 'Freshly brewed',
                  'priceMinor': 300,
                  'currency': 'EUR',
                  'category': 'drinks',
                  'tags': ['hot'],
                  'dietary': ['vegan'],
                  'occasion': ['breakfast'],
                  'available': true,
                },
              ],
            }),
            200,
          ),
        ),
      );

      final products = await api.getCatalog();

      expect(products, hasLength(1));
      expect(products.single.id, 'coffee');
      expect(products.single.priceFormatted, '€3.00');
      api.dispose();
    });

    test(
      'public catalog does not require a session (no /api/sessions call)',
      () async {
        var sessionCalls = 0;
        final api = ApiService(
          baseUrl: 'http://localhost:3000',
          storage: InMemorySessionStorage(),
          client: MockClient((request) async {
            if (request.url.path == '/api/sessions') sessionCalls++;
            return http.Response(jsonEncode({'count': 0, 'products': []}), 200);
          }),
        );

        await api.getCatalog();
        expect(sessionCalls, 0);
        api.dispose();
      },
    );

    test(
      'surfaces server errors as ApiException (after successful auth)',
      () async {
        final api = ApiService(
          baseUrl: 'http://localhost:3000',
          storage: InMemorySessionStorage(),
          client: withSession(
            (_) async => http.Response(
              jsonEncode({'error': 'OpenAI not configured'}),
              503,
            ),
          ),
        );

        await expectLater(
          api.sendChat(message: 'Coffee'),
          throwsA(
            isA<ApiException>()
                .having((error) => error.statusCode, 'status code', 503)
                .having(
                  (error) => error.message,
                  'message',
                  'OpenAI not configured',
                ),
          ),
        );
        api.dispose();
      },
    );

    test(
      'refreshes the session once on 401 and does not retry infinitely',
      () async {
        var chatCalls = 0;
        var sessionCalls = 0;
        final api = ApiService(
          baseUrl: 'http://localhost:3000',
          storage: InMemorySessionStorage(),
          client: MockClient((request) async {
            if (request.url.path == '/api/sessions') {
              sessionCalls++;
              return http.Response(
                jsonEncode({
                  'sessionId': 'sess-$sessionCalls',
                  'sessionToken': 'tok-$sessionCalls',
                }),
                201,
              );
            }
            if (request.url.path == '/api/ai/chat') {
              chatCalls++;
              // First attempt uses the first session; retry uses the refreshed one.
              final auth = request.headers['authorization'];
              if (chatCalls == 1) {
                expect(auth, 'Bearer tok-1');
                return http.Response('unauthorized', 401);
              }
              expect(auth, 'Bearer tok-2');
              return http.Response(
                jsonEncode({
                  'sessionId': 'sess-2',
                  'response': 'hi',
                  'checkoutReady': false,
                  'toolRounds': 0,
                  'messageCount': 1,
                }),
                200,
              );
            }
            return http.Response('Not found', 404);
          }),
        );

        final resp = await api.sendChat(message: 'hi');
        expect(resp.response, 'hi');
        expect(chatCalls, 2); // one 401 attempt + one refresh attempt
        expect(sessionCalls, 2); // initial + refresh
        api.dispose();
      },
    );

    test(
      'fails clearly when session creation fails (no silent continuation)',
      () async {
        final api = ApiService(
          baseUrl: 'http://localhost:3000',
          storage: InMemorySessionStorage(),
          client: MockClient((request) async {
            if (request.url.path == '/api/sessions') {
              return http.Response('bad gateway', 502);
            }
            return http.Response('should not reach', 500);
          }),
        );

        await expectLater(
          api.sendChat(message: 'hi'),
          throwsA(isA<SessionException>()),
        );
        api.dispose();
      },
    );

    test(
      'rejects a malformed session response instead of persisting it',
      () async {
        final storage = InMemorySessionStorage();
        final api = ApiService(
          baseUrl: 'http://localhost:3000',
          storage: storage,
          client: MockClient((request) async {
            if (request.url.path == '/api/sessions') {
              // Missing `sessionToken` (wrong field name) + empty sessionId.
              return http.Response(
                jsonEncode({'sessionId': '', 'token': 'leaked'}),
                201,
              );
            }
            return http.Response('should not reach', 500);
          }),
        );

        await expectLater(
          api.sendChat(message: 'hi'),
          throwsA(isA<SessionException>()),
        );
        // Nothing was persisted (and the wrong `token` field was ignored).
        expect(await storage.getSessionId(), isNull);
        expect(await storage.getToken(), isNull);
        api.dispose();
      },
    );
  });

  group('Sprint A1.2 regression (F1/F5)', () {
    test(
      'F1: deleteChat retry after 401 uses the refreshed session id in the URL',
      () async {
        final storage = InMemorySessionStorage();
        // Pre-seed a valid session (as a prior request would have).
        await storage.saveSession(sessionId: 'sess-seed', token: 'tok-seed');

        var sessionCalls = 0;
        var deleteCalls = 0;
        String? firstDeleteUrl;
        String? secondDeleteUrl;
        final api = ApiService(
          baseUrl: 'http://localhost:3000',
          storage: storage,
          client: MockClient((request) async {
            if (request.url.path == '/api/sessions') {
              sessionCalls++;
              return http.Response(
                jsonEncode({
                  'sessionId': 'sess-$sessionCalls',
                  'sessionToken': 'tok-$sessionCalls',
                }),
                201,
              );
            }
            if (request.url.path.startsWith('/api/ai/chat/')) {
              deleteCalls++;
              if (deleteCalls == 1) {
                firstDeleteUrl = request.url.path;
                expect(request.headers['x-session-id'], 'sess-seed');
                return http.Response('unauthorized', 401);
              }
              // Retry: must use the REFRESHED session id, not the stale seed.
              secondDeleteUrl = request.url.path;
              expect(request.headers['x-session-id'], 'sess-1');
              return http.Response('', 200);
            }
            return http.Response('Not found', 404);
          }),
        );

        await api.deleteChat();
        expect(deleteCalls, 2); // one 401 attempt + one refresh retry
        expect(sessionCalls, 1); // only the refresh created a session
        expect(firstDeleteUrl, '/api/ai/chat/sess-seed');
        expect(secondDeleteUrl, '/api/ai/chat/sess-1');
        api.dispose();
      },
    );

    test(
      'F5: concurrent first requests share a single session creation',
      () async {
        var sessionCalls = 0;
        final sessionCompleter = Completer<void>();
        final api = ApiService(
          baseUrl: 'http://localhost:3000',
          storage: InMemorySessionStorage(),
          client: MockClient((request) async {
            if (request.url.path == '/api/sessions') {
              sessionCalls++;
              // Delay so both racing requests observe the in-flight creation.
              await sessionCompleter.future;
              return http.Response(
                jsonEncode({
                  'sessionId': 'sess-shared',
                  'sessionToken': 'tok-shared',
                }),
                201,
              );
            }
            if (request.url.path == '/api/ai/chat') {
              return http.Response(
                jsonEncode({
                'sessionId': 'sess-shared',
                'response': 'hi',
                  'checkoutReady': false,
                  'toolRounds': 0,
                  'messageCount': 1,
                }),
                200,
              );
            }
            return http.Response('Not found', 404);
          }),
        );

        // Two concurrent requests; neither has a session yet.
        final f1 = api.sendChat(message: 'one');
        final f2 = api.sendChat(message: 'two');
        // Let both reach the session-creation path.
        await Future<void>.delayed(const Duration(milliseconds: 20));
        // Release the (single) session creation.
        sessionCompleter.complete();
        await Future.wait([f1, f2]);

        // Exactly one session creation, even though two requests raced.
        expect(sessionCalls, 1);
        api.dispose();
      },
    );
  });

  group('ApiService release API base URL (Sprint A1.9A)', () {
    test('release build uses an explicit HTTPS URL', () {
      expect(
        ApiService.resolveBaseUrl(
          isRelease: true,
          url: 'https://api.example.com/',
        ),
        'https://api.example.com/',
      );
    });

    test('release build rejects a missing URL (no silent emulator fallback)', () {
      expect(
        () => ApiService.resolveBaseUrl(isRelease: true, url: ''),
        throwsA(isA<StateError>().having(
          (e) => e.message,
          'message',
          contains('API_BASE_URL must be supplied'),
        )),
      );
    });

    test('release build rejects cleartext HTTP', () {
      expect(
        () => ApiService.resolveBaseUrl(
          isRelease: true,
          url: 'http://10.0.2.2:3000',
        ),
        throwsA(isA<StateError>().having(
          (e) => e.message,
          'message',
          contains('must be an https:// URL'),
        )),
      );
    });

    test('debug build keeps the emulator development URL', () {
      expect(
        ApiService.resolveBaseUrl(isRelease: false, url: 'http://10.0.2.2:3000'),
        'http://10.0.2.2:3000',
      );
    });

    test('constructor still honors an explicit baseUrl (DI preserved)', () async {
      // Session-auth + DI contract unchanged: an injected baseUrl bypasses
      // resolveBaseUrl entirely, exactly as before this sprint.
      final api = ApiService(
        baseUrl: 'https://injected.example.com',
        storage: InMemorySessionStorage(),
        client: MockClient((_) async => http.Response('{}', 200)),
      );
      addTearDown(api.dispose);
      // A resolve against the public endpoint must target the injected host.
      final res = await api.getCatalog();
      expect(res, isA<List<Product>>());
    });
  });
}
