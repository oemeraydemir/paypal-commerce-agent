import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/services/api_service.dart';
import 'package:flutter_app/models/shopper_preferences.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  group('ApiService', () {
    test('sends shopper profile with the AI request', () async {
      final api = ApiService(
        baseUrl: 'http://localhost:3000',
        client: MockClient((request) async {
          final body = jsonDecode(request.body) as Map<String, dynamic>;
          expect(body['preferences'], {
            'dietary': ['vegan'],
            'maxBudgetMinor': 1200,
          });
          return http.Response(
            jsonEncode({
              'sessionId': 'profile-session',
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
        sessionId: 'profile-session',
        message: 'Breakfast please',
        preferences: const ShopperPreferences(
          dietary: {'vegan'},
          maxBudgetMinor: 1200,
        ),
      );
      api.dispose();
    });

    test('reports AI and PayPal sandbox readiness', () async {
      final api = ApiService(
        baseUrl: 'http://localhost:3000/',
        client: MockClient((request) async {
          expect(request.url.toString(), 'http://localhost:3000/api/health');
          return http.Response(
            jsonEncode({
              'status': 'ok',
              'paypal': {'enabled': true, 'environment': 'sandbox'},
              'ai': {'enabled': true},
            }),
            200,
          );
        }),
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

    test('surfaces server errors as ApiException', () async {
      final api = ApiService(
        baseUrl: 'http://localhost:3000',
        client: MockClient(
          (_) async => http.Response(
            jsonEncode({'error': 'OpenAI not configured'}),
            503,
          ),
        ),
      );

      await expectLater(
        api.sendChat(sessionId: 'test-session', message: 'Coffee'),
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
    });
  });
}
