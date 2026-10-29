import 'dart:convert';

/// One server-recorded policy decision inside the Dispute Evidence Package.
///
/// Everything here comes from the SERVER's own records; the client never
/// derives or guesses a decision.
class EvidencePolicyEvent {
  final DateTime? timestamp;
  final String decision;
  final String reason;
  final List<String> violatedRules;

  const EvidencePolicyEvent({
    required this.decision,
    required this.reason,
    required this.violatedRules,
    this.timestamp,
  });

  static List<EvidencePolicyEvent> listFrom(Object? raw) {
    if (raw is! List) return const <EvidencePolicyEvent>[];
    final out = <EvidencePolicyEvent>[];
    for (final item in raw) {
      if (item is! Map) continue;
      final stamp = item['timestamp'];
      final rules = item['violatedRules'];
      out.add(
        EvidencePolicyEvent(
          timestamp: stamp is String ? DateTime.tryParse(stamp) : null,
          decision: item['decision'] is String ? item['decision'] as String : '',
          reason: item['reason'] is String ? item['reason'] as String : '',
          violatedRules: rules is List
              ? rules.whereType<String>().toList(growable: false)
              : const <String>[],
        ),
      );
    }
    return out;
  }
}

/// The signed Dispute Evidence Package for one order
/// (`GET /api/orders/:id/evidence`).
///
/// The package bundles the signed Cart Mandate, the policy decisions the
/// server actually enforced, the order and the human-approval state, and it is
/// signed with the same keyring as the mandate. It is prepared for
/// presentation; it is NEVER submitted to PayPal automatically.
class EvidencePackage {
  final String orderId;
  final DateTime? issuedAt;
  final String status;
  final DateTime? orderCreatedAt;
  final DateTime? orderUpdatedAt;
  final String? captureId;
  final String approvalState;
  final List<EvidencePolicyEvent> policyEvents;
  final String alg;
  final String kid;
  final String digest;

  /// The package exactly as the server sent it, so it can be re-sent to
  /// `POST /api/evidence/verify` without being rebuilt (a rebuilt package would
  /// not verify).
  final Map<String, dynamic> raw;

  const EvidencePackage({
    required this.orderId,
    required this.status,
    required this.approvalState,
    required this.policyEvents,
    required this.alg,
    required this.kid,
    required this.digest,
    required this.raw,
    this.issuedAt,
    this.orderCreatedAt,
    this.orderUpdatedAt,
    this.captureId,
  });

  /// Returns `null` for a missing or malformed payload: the evidence section
  /// is an extra and must never break the receipt.
  static EvidencePackage? tryParse(Object? raw) {
    if (raw is! Map) return null;
    final order = raw['order'];
    if (order is! Map) return null;
    final orderId = order['id'];
    if (orderId is! String || orderId.isEmpty) return null;
    final integrity = raw['integrity'];
    final approval = raw['humanApproval'];
    final issuedAt = raw['issuedAt'];
    final createdAt = order['createdAt'];
    final updatedAt = order['updatedAt'];
    final captureId = order['paypalCaptureId'];

    return EvidencePackage(
      orderId: orderId,
      issuedAt: issuedAt is String ? DateTime.tryParse(issuedAt) : null,
      status: order['status'] is String ? order['status'] as String : '',
      orderCreatedAt: createdAt is String ? DateTime.tryParse(createdAt) : null,
      orderUpdatedAt: updatedAt is String ? DateTime.tryParse(updatedAt) : null,
      captureId: captureId is String && captureId.isNotEmpty ? captureId : null,
      approvalState:
          approval is Map && approval['state'] is String
          ? approval['state'] as String
          : 'not_recorded',
      policyEvents: EvidencePolicyEvent.listFrom(raw['policyEvents']),
      alg: integrity is Map && integrity['alg'] is String
          ? integrity['alg'] as String
          : '',
      kid: integrity is Map && integrity['kid'] is String
          ? integrity['kid'] as String
          : '',
      digest: integrity is Map && integrity['digest'] is String
          ? integrity['digest'] as String
          : '',
      raw: Map<String, dynamic>.from(raw),
    );
  }

  /// The payload to send back to the verifier.
  String encode() => jsonEncode(raw);
}

/// The server's verdict for a submitted package (`POST /api/evidence/verify`).
class EvidenceVerification {
  final bool valid;
  final bool signature;
  final bool digest;
  final bool mandateValid;
  final bool matchesOrder;
  final String? reason;

  const EvidenceVerification({
    required this.valid,
    required this.signature,
    required this.digest,
    required this.mandateValid,
    required this.matchesOrder,
    this.reason,
  });

  static EvidenceVerification fromJson(Map<String, dynamic> json) {
    final checks = json['checks'];
    final c = checks is Map ? checks : const <String, dynamic>{};
    bool flag(String key) => c[key] == true;
    final reason = json['reason'];
    return EvidenceVerification(
      valid: json['valid'] == true,
      signature: flag('signature'),
      digest: flag('digest'),
      mandateValid: flag('mandateValid'),
      matchesOrder: flag('matchesOrder'),
      reason: reason is String ? reason : null,
    );
  }
}
