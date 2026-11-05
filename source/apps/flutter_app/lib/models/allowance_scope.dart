/// A scoped AI allowance: a session-bound permission surface that limits what a
/// checkout may spend. It can never exceed the shopper's policy ceiling
/// (non-escalation is enforced server-side).
///
/// Mirrors the backend `scopeView` shape (`routes/policy.ts`). The status is
/// one of: ACTIVE, PENDING_APPROVAL, REVOKED, EXPIRED, SPENT.
class AllowanceScope {
  final String id;
  final String kind; // SHOPPER_CREATED | AGENT_PROPOSED
  final String label;
  final String? sessionRef;
  final List<String> originsAllowed;
  final String currency;
  final int? maxPerPurchaseMinor;
  final int? dailySpendLimitMinor;
  final Map<String, int>? categorySpendLimits;
  final List<String>? allowedMerchantIds;
  final Map<String, dynamic>? nightWindow;
  final String status;
  final String issuedBy;
  final String? approvedBy;
  final String createdAt;
  final String? expiresAt;
  final String updatedAt;

  const AllowanceScope({
    required this.id,
    required this.kind,
    required this.label,
    this.sessionRef,
    this.originsAllowed = const <String>[],
    required this.currency,
    this.maxPerPurchaseMinor,
    this.dailySpendLimitMinor,
    this.categorySpendLimits,
    this.allowedMerchantIds,
    this.nightWindow,
    required this.status,
    required this.issuedBy,
    this.approvedBy,
    required this.createdAt,
    this.expiresAt,
    required this.updatedAt,
  });

  factory AllowanceScope.fromJson(Map<String, dynamic> json) {
    int? minor(Object? v) => v is num ? v.toInt() : null;
    Map<String, int>? catMap(Object? v) {
      if (v is! Map) return null;
      return v.map((k, value) => MapEntry(
          k.toString(), value is num ? value.toInt() : 0));
    }

    return AllowanceScope(
      id: json['id'] as String? ?? '',
      kind: json['kind'] as String? ?? 'SHOPPER_CREATED',
      label: json['label'] as String? ?? '',
      sessionRef: json['sessionRef'] as String?,
      originsAllowed: json['originsAllowed'] is List
          ? (json['originsAllowed'] as List).whereType<String>().toList()
          : const <String>[],
      currency: json['currency'] as String? ?? 'EUR',
      maxPerPurchaseMinor: minor(json['maxPerPurchaseMinor']),
      dailySpendLimitMinor: minor(json['dailySpendLimitMinor']),
      categorySpendLimits: catMap(json['categorySpendLimits']),
      allowedMerchantIds: json['allowedMerchantIds'] is List
          ? (json['allowedMerchantIds'] as List).whereType<String>().toList()
          : null,
      nightWindow: json['nightWindow'] is Map
          ? (json['nightWindow'] as Map).cast<String, dynamic>()
          : null,
      status: json['status'] as String? ?? 'ACTIVE',
      issuedBy: json['issuedBy'] as String? ?? '',
      approvedBy: json['approvedBy'] as String?,
      createdAt: json['createdAt'] as String? ?? '',
      expiresAt: json['expiresAt'] as String?,
      updatedAt: json['updatedAt'] as String? ?? '',
    );
  }

  bool get pendingApproval => status == 'PENDING_APPROVAL';
  bool get active => status == 'ACTIVE';
}
