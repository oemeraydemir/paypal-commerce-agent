import 'dart:convert';

import 'package:test/test.dart';

import 'package:flutter_app/models/evidence_package.dart';

/// A realistic `GET /api/orders/:id/evidence` payload, trimmed to what the
/// client reads. The shape mirrors the backend's Evidence Package.
Map<String, dynamic> samplePackage() => <String, dynamic>{
  'version': 'aicafe.evidence/1',
  'orderId': 'order-1',
  'issuedAt': '2026-10-29T13:02:05.000Z',
  'mandate': <String, dynamic>{
    'mandate': <String, dynamic>{'orderId': 'order-1'},
    'signature': 'sig-abc',
    'alg': 'EdDSA',
    'kid': 'kid-1',
    'canonicalization': 'aicafe-stable-json/1',
  },
  'order': <String, dynamic>{
    'id': 'order-1',
    'status': 'PAID',
    'origin': 'ai',
    'totalMinor': 2000,
    'currency': 'EUR',
    'createdAt': '2026-10-29T13:01:00.000Z',
    'updatedAt': '2026-10-29T13:02:00.000Z',
    'items': <dynamic>[
      <String, dynamic>{'productId': 'p1', 'quantity': 2},
    ],
    'paypalOrderId': 'PAY-1',
    'paypalCaptureId': 'CAP-1',
    'paypalStatus': 'COMPLETED',
  },
  'policyEvents': <dynamic>[
    <String, dynamic>{
      'id': 'ev-1',
      'timestamp': '2026-10-29T13:01:10.000Z',
      'decision': 'REQUIRE_CONFIRMATION',
      'violatedRules': <String>['CONFIRMATION_THRESHOLD_EXCEEDED'],
      'reason': 'Cart exceeds confirmation threshold',
      'amountMinor': 2000,
      'currency': 'EUR',
      'policySnapshot': <String, dynamic>{},
    },
  ],
  'humanApproval': <String, dynamic>{
    'authority': 'buyer_approval_at_paypal',
    'state': 'approved',
    'paypalCaptureId': 'CAP-1',
  },
  'integrity': <String, dynamic>{
    'alg': 'EdDSA',
    'kid': 'kid-1',
    'canonicalization': 'aicafe-stable-json/1',
    'digest': 'abcdef0123456789abcdef0123456789',
    'signature': 'sig-abc',
  },
};

void main() {
  group('EvidencePackage', () {
    test('parses the order, the approval and the integrity block', () {
      final pkg = EvidencePackage.tryParse(samplePackage());
      expect(pkg, isNotNull);
      expect(pkg!.orderId, 'order-1');
      expect(pkg.status, 'PAID');
      expect(pkg.captureId, 'CAP-1');
      expect(pkg.approvalState, 'approved');
      expect(pkg.alg, 'EdDSA');
      expect(pkg.kid, 'kid-1');
      expect(pkg.digest, 'abcdef0123456789abcdef0123456789');
      expect(pkg.orderCreatedAt, isNotNull);
      expect(pkg.orderUpdatedAt, isNotNull);
      expect(pkg.issuedAt, isNotNull);
    });

    test('parses the policy events the server actually enforced', () {
      final pkg = EvidencePackage.tryParse(samplePackage())!;
      expect(pkg.policyEvents, hasLength(1));
      final event = pkg.policyEvents.first;
      expect(event.decision, 'REQUIRE_CONFIRMATION');
      expect(event.reason, 'Cart exceeds confirmation threshold');
      expect(event.violatedRules, <String>['CONFIRMATION_THRESHOLD_EXCEEDED']);
      expect(event.timestamp, isNotNull);
    });

    test('the payload is kept verbatim so the verifier gets the same package', () {
      final raw = samplePackage();
      final pkg = EvidencePackage.tryParse(raw)!;
      // Re-encoding must reproduce the server's bytes: a rebuilt package would
      // not verify.
      expect(jsonDecode(pkg.encode()), equals(raw));
    });

    test('a malformed payload yields null instead of throwing', () {
      expect(EvidencePackage.tryParse(null), isNull);
      expect(EvidencePackage.tryParse('not a package'), isNull);
      expect(EvidencePackage.tryParse(<String, dynamic>{}), isNull);
      // An order without an id cannot be trusted.
      final noId = samplePackage();
      (noId['order'] as Map<String, dynamic>)['id'] = '';
      expect(EvidencePackage.tryParse(noId), isNull);
    });

    test('an order without a capture id is reported as none', () {
      final raw = samplePackage();
      (raw['order'] as Map<String, dynamic>)['paypalCaptureId'] = '';
      final pkg = EvidencePackage.tryParse(raw)!;
      expect(pkg.captureId, isNull);
    });

    test('a missing human-approval block is reported as not recorded', () {
      final raw = samplePackage();
      raw.remove('humanApproval');
      final pkg = EvidencePackage.tryParse(raw)!;
      expect(pkg.approvalState, 'not_recorded');
    });
  });

  group('EvidenceVerification', () {
    test('reads the server verdict and its individual checks', () {
      final v = EvidenceVerification.fromJson(<String, dynamic>{
        'valid': true,
        'checks': <String, dynamic>{
          'present': true,
          'signature': true,
          'digest': true,
          'mandateValid': true,
          'matchesOrder': true,
          'notExpired': true,
        },
      });
      expect(v.valid, isTrue);
      expect(v.signature, isTrue);
      expect(v.digest, isTrue);
      expect(v.mandateValid, isTrue);
      expect(v.matchesOrder, isTrue);
      expect(v.reason, isNull);
    });

    test('a failed check is never reported as valid', () {
      final v = EvidenceVerification.fromJson(<String, dynamic>{
        'valid': false,
        'checks': <String, dynamic>{
          'signature': false,
          'digest': true,
          'mandateValid': true,
          'matchesOrder': false,
        },
        'reason': 'Evidence integrity, mandate or order-match check failed.',
      });
      expect(v.valid, isFalse);
      expect(v.signature, isFalse);
      expect(v.matchesOrder, isFalse);
      expect(v.reason, isNotNull);
    });

    test('missing checks are false, never true by default', () {
      final v = EvidenceVerification.fromJson(<String, dynamic>{'valid': false});
      expect(v.valid, isFalse);
      expect(v.signature, isFalse);
      expect(v.digest, isFalse);
      expect(v.mandateValid, isFalse);
      expect(v.matchesOrder, isFalse);
    });
  });
}
