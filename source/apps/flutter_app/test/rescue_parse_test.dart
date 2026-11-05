import 'package:test/test.dart';

import 'package:flutter_app/services/error_body.dart';

/// Verifies the backend's structured Checkout Rescue fields are parsed
/// faithfully (`code`, `retryable`, `retryAfterSeconds`, `cartSaved`,
/// `suggestion`, `alternativePayment`, `details.settled`), and that ordinary
/// failures never invent them.
void main() {
  group('parseErrorBody', () {
    test('captures structured Checkout Rescue fields from a 502 body', () {
      final f = parseErrorBody('''
{
  "error": "PayPal is busy right now.",
  "details": {
    "code": "PAYPAL_BUSY",
    "retryable": true,
    "retryAfterSeconds": 30,
    "cartSaved": true,
    "suggestion": "Wait about 30 seconds, then retry.",
    "alternativePayment": "Try another card."
  }
}
''');
      expect(f.message, contains('busy'));
      expect(f.retryable, isTrue);
      expect(f.retryAfterSeconds, 30);
      expect(f.cartSaved, isTrue);
      expect(f.code, 'PAYPAL_BUSY');
      expect(f.suggestion, contains('30'));
      expect(f.alternativePayment, contains('card'));
      expect(f.settled, isNull);
    });

    test('a plain failure leaves the rescue flags off', () {
      final f = parseErrorBody('{"error":"Payment declined"}');
      expect(f.message, 'Payment declined');
      expect(f.retryable, isFalse);
      expect(f.retryAfterSeconds, 0);
      expect(f.cartSaved, isFalse);
      expect(f.code, isNull);
      expect(f.suggestion, isNull);
      expect(f.alternativePayment, isNull);
    });

    test('a verified-settled 409 conflict exposes settled=true', () {
      final f = parseErrorBody('''
{"error":"Order already captured","details":{"settled":true}}
''');
      expect(f.settled, isTrue);
      expect(f.message, contains('already captured'));
    });

    test('top-level fallback fields are accepted too', () {
      final f = parseErrorBody('''
{"error":"busy","retryable":true,"retryAfterSeconds":15,"cartSaved":true}
''');
      expect(f.retryable, isTrue);
      expect(f.retryAfterSeconds, 15);
      expect(f.cartSaved, isTrue);
    });

    test('non-JSON or empty bodies degrade to an empty message', () {
      expect(parseErrorBody('').message, '');
      expect(parseErrorBody('not json').message, '');
    });
  });
}
