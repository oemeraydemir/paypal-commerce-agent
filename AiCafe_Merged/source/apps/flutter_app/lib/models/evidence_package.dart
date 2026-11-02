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

  /// Priority 1: the full rule detail the server recorded for each violated
  /// rule (which rule fired, expected vs actual). Empty for older backends.
  final List<EvidenceRuleDetail> ruleDetails;

  const EvidencePolicyEvent({
    required this.decision,
    required this.reason,
    required this.violatedRules,
    this.timestamp,
    this.ruleDetails = const <EvidenceRuleDetail>[],
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
          ruleDetails: EvidenceRuleDetail.listFrom(item['ruleDetails']),
        ),
      );
    }
    return out;
  }
}

/// Full detail of a single policy rule that fired (which rule, why,
/// expected vs actual). Kept compact for display; it mirrors the backend's
/// `EvidenceRuleDetail`.
class EvidenceRuleDetail {
  final String type;
  final String rule;
  final String expected;
  final String actual;
  final String message;

  const EvidenceRuleDetail({
    required this.type,
    required this.rule,
    required this.expected,
    required this.actual,
    required this.message,
  });

  static List<EvidenceRuleDetail> listFrom(Object? raw) {
    if (raw is! List) return const <EvidenceRuleDetail>[];
    final out = <EvidenceRuleDetail>[];
    for (final item in raw) {
      if (item is! Map) continue;
      out.add(
        EvidenceRuleDetail(
          type: item['type'] is String ? item['type'] as String : '',
          rule: item['rule'] is String ? item['rule'] as String : '',
          expected: _asText(item['expected']),
          actual: _asText(item['actual']),
          message: item['message'] is String ? item['message'] as String : '',
        ),
      );
    }
    return out;
  }

  static String _asText(Object? value) {
    if (value == null) return '';
    if (value is String) return value;
    if (value is List) return value.map((e) => e.toString()).join(', ');
    return value.toString();
  }
}

/// One canonical, server-built step in the Order-to-Resolution timeline. The
/// UI renders this verbatim; it never re-sorts or re-derives the events.
class EvidenceTimelineStep {
  /// One of ORDER_CREATED | POLICY_EVALUATED | HUMAN_APPROVAL |
  /// PAYMENT_CAPTURED (raw from the server; the UI localises the label).
  final String step;
  final DateTime? at;
  final String detail;
  final String decision;

  const EvidenceTimelineStep({
    required this.step,
    this.at,
    this.detail = '',
    this.decision = '',
  });

  static List<EvidenceTimelineStep> listFrom(Object? raw) {
    if (raw is! List) return const <EvidenceTimelineStep>[];
    final out = <EvidenceTimelineStep>[];
    for (final item in raw) {
      if (item is! Map) continue;
      final at = item['at'];
      out.add(
        EvidenceTimelineStep(
          step: item['step'] is String ? item['step'] as String : '',
          at: at is String ? DateTime.tryParse(at) : null,
          detail: item['detail'] is String ? item['detail'] as String : '',
          decision: item['decision'] is String ? item['decision'] as String : '',
        ),
      );
    }
    return out;
  }
}

/// A dispute-ready defense statement assembled and signed by the server. It is
/// prepared for PRESENTATION only; it never guarantees a chargeback win.
class EvidenceDisputeDefense {
  final String templateVersion;
  final String claimType;
  final String orderReference;
  final int amountMinor;
  final String currency;
  final List<String> keyFacts;
  final List<({String label, String pointer})> evidencePointers;
  final String recommendedResponse;

  /// Human-readable, multi-line narrative (suitable for saving/printing).
  final String narrative;

  const EvidenceDisputeDefense({
    required this.templateVersion,
    required this.claimType,
    required this.orderReference,
    required this.amountMinor,
    required this.currency,
    required this.keyFacts,
    required this.evidencePointers,
    required this.recommendedResponse,
    required this.narrative,
  });

  static EvidenceDisputeDefense? tryParse(Object? raw) {
    if (raw is! Map) return null;
    final templateVersion = raw['templateVersion'];
    final orderReference = raw['orderReference'];
    if (templateVersion is! String || orderReference is! String) return null;
    final pointers = <({String label, String pointer})>[];
    final rawPointers = raw['evidencePointers'];
    if (rawPointers is List) {
      for (final item in rawPointers) {
        if (item is! Map) continue;
        final label = item['label'];
        final pointer = item['pointer'];
        if (label is String && pointer is String) {
          pointers.add((label: label, pointer: pointer));
        }
      }
    }
    final keyFacts = raw['keyFacts'];
    final amountMinor = raw['amountMinor'];
    return EvidenceDisputeDefense(
      templateVersion: templateVersion,
      claimType: raw['claimType'] is String ? raw['claimType'] as String : '',
      orderReference: orderReference,
      amountMinor: amountMinor is num ? amountMinor.toInt() : 0,
      currency: raw['currency'] is String ? raw['currency'] as String : '',
      keyFacts: keyFacts is List
          ? keyFacts.whereType<String>().toList(growable: false)
          : const <String>[],
      evidencePointers: pointers,
      recommendedResponse: raw['recommendedResponse'] is String
          ? raw['recommendedResponse'] as String
          : '',
      narrative: raw['narrative'] is String ? raw['narrative'] as String : '',
    );
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

  /// Priority 1: the server-built, chronological timeline. Empty for older
  /// backends; the UI falls back to composing one from the events.
  final List<EvidenceTimelineStep> timeline;

  /// Priority 1: the server-built dispute-defense statement. `null` for older
  /// backends; the UI simply hides that section.
  final EvidenceDisputeDefense? disputeDefense;

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
    this.timeline = const <EvidenceTimelineStep>[],
    this.disputeDefense,
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
      timeline: EvidenceTimelineStep.listFrom(raw['timeline']),
      disputeDefense: EvidenceDisputeDefense.tryParse(raw['disputeDefense']),
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
