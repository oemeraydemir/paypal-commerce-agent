import 'package:flutter_test/flutter_test.dart';

import 'package:flutter_app/models/cart.dart';

/// Verifies that [PreparedCart] reads the policy metadata the backend already
/// sends in `preparedCart`.
///
/// The payloads below are the real shapes from
/// `apps/backend/src/ai/tool-executor.ts` and `src/ai/fallback-planner.ts`
/// (`{items, totalMinor, totalFormatted, currency, cartId, message,
/// policyDecision, policyViolations, requiresExplicitApproval, retrySuggested,
/// reason}`), not invented fields.
void main() {
  group('PreparedCart policy metadata', () {
    test('reads an AUTO_ALLOW cart (real rule-based fallback payload)', () {
      final cart = PreparedCart.fromJson(<String, dynamic>{
        'items': [
          {
            'productId': 'coffee',
            'name': 'Fresh Brewed Coffee',
            'quantity': 1,
            'unitPriceMinor': 300,
            'unitPriceFormatted': '€3.00',
            'lineTotalMinor': 300,
            'lineTotalFormatted': '€3.00',
          },
        ],
        'totalMinor': 300,
        'totalFormatted': '€3.00',
        'currency': 'EUR',
        'cartId': 'cart_e10bf2b9f593c3b0',
        'message': 'Cart prepared with 1 item(s). Total: €3.00.',
        'policyDecision': 'AUTO_ALLOW',
        'policyViolations': <dynamic>[],
        'requiresExplicitApproval': false,
        'retrySuggested': false,
        'reason': 'Policy check passed',
      });

      expect(cart.policyDecision, PolicyDecision.autoAllow);
      expect(cart.requiresExplicitApproval, isFalse);
      expect(cart.retrySuggested, isFalse);
      expect(cart.isBlocked, isFalse);
      expect(cart.hasPolicyViolations, isFalse);
      expect(cart.reason, 'Policy check passed');
      expect(cart.cartId, 'cart_e10bf2b9f593c3b0');
    });

    test('reads a REQUIRE_CONFIRMATION cart with its violation', () {
      final cart = PreparedCart.fromJson(<String, dynamic>{
        'items': <dynamic>[],
        'totalMinor': 1300,
        'totalFormatted': '€13.00',
        'currency': 'EUR',
        'policyDecision': 'REQUIRE_CONFIRMATION',
        'policyViolations': [
          {
            'type': 'CONFIRMATION_THRESHOLD_EXCEEDED',
            'message':
                'Order total 1300 exceeds the confirmation threshold 1000.',
          },
        ],
        'requiresExplicitApproval': true,
        'retrySuggested': false,
        'reason': 'Cart exceeds confirmation threshold; explicit approval required',
      });

      expect(cart.policyDecision, PolicyDecision.requireConfirmation);
      expect(cart.requiresExplicitApproval, isTrue);
      expect(cart.hasPolicyViolations, isTrue);
      expect(cart.policyViolations, hasLength(1));
      expect(cart.policyViolations.first.type, 'CONFIRMATION_THRESHOLD_EXCEEDED');
      expect(cart.policyViolations.first.message, contains('confirmation threshold'));
      expect(cart.isBlocked, isFalse);
    });

    test('reads a BLOCK cart and marks it blocked + retry suggested', () {
      final cart = PreparedCart.fromJson(<String, dynamic>{
        'items': <dynamic>[],
        'totalMinor': 2600,
        'totalFormatted': '€26.00',
        'currency': 'EUR',
        'policyDecision': 'BLOCK',
        'policyViolations': [
          {'type': 'MAX_PURCHASE_EXCEEDED', 'message': 'Cart exceeds maximum purchase limit'},
        ],
        'requiresExplicitApproval': false,
        'retrySuggested': true,
        'reason': 'Cart exceeds maximum purchase limit',
      });

      expect(cart.policyDecision, PolicyDecision.block);
      expect(cart.isBlocked, isTrue);
      expect(cart.retrySuggested, isTrue);
      expect(cart.requiresExplicitApproval, isFalse);
    });

    test('missing policy fields degrade to unknown/false, never throw', () {
      final cart = PreparedCart.fromJson(<String, dynamic>{
        'items': <dynamic>[],
        'totalMinor': 0,
        'totalFormatted': '€0.00',
        'currency': 'EUR',
      });

      // Absent must never be read as "auto-approved".
      expect(cart.policyDecision, PolicyDecision.unknown);
      expect(cart.requiresExplicitApproval, isFalse);
      expect(cart.retrySuggested, isFalse);
      expect(cart.policyViolations, isEmpty);
      expect(cart.cartId, '');
      expect(cart.reason, '');
      expect(cart.isBlocked, isFalse);
    });

    test('an unrecognised decision is unknown, not auto-allow', () {
      final cart = PreparedCart.fromJson(<String, dynamic>{
        'policyDecision': 'SOME_FUTURE_DECISION',
      });

      expect(cart.policyDecision, PolicyDecision.unknown);
      expect(cart.isBlocked, isFalse);
    });

    test('a non-list policyViolations value is ignored', () {
      final cart = PreparedCart.fromJson(<String, dynamic>{
        'policyDecision': 'BLOCK',
        'policyViolations': 'not-a-list',
      });

      expect(cart.policyViolations, isEmpty);
      expect(cart.hasPolicyViolations, isFalse);
    });

    test('malformed violation entries are skipped, valid ones kept', () {
      final cart = PreparedCart.fromJson(<String, dynamic>{
        'policyDecision': 'REQUIRE_CONFIRMATION',
        'policyViolations': [
          'garbage',
          42,
          {'type': 'DAILY_LIMIT_EXCEEDED', 'message': 'Daily limit reached'},
          {'type': 'CURRENCY_MISMATCH'},
        ],
      });

      expect(cart.policyViolations, hasLength(2));
      expect(cart.policyViolations.first.type, 'DAILY_LIMIT_EXCEEDED');
      // A violation without a message still parses; the client never invents text.
      expect(cart.policyViolations.last.message, '');
    });
  });
}
