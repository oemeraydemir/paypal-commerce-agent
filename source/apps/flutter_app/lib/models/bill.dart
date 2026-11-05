/// Split Bill models (parity with the Web room `split.js` and backend
/// `routes/bills.ts`). The server owns every amount, status and permission;
/// the client only renders what it returns.
library;

String _str(Object? v, [String fallback = '']) => v is String ? v : fallback;
int _int(Object? v) => v is num ? v.toInt() : 0;

/// One line of the shared cart.
class BillItemView {
  final String productId;
  final String name;
  final int quantity;
  final int lineTotalMinor;

  const BillItemView({
    required this.productId,
    required this.name,
    required this.quantity,
    required this.lineTotalMinor,
  });

  factory BillItemView.fromJson(Map<String, dynamic> json) => BillItemView(
    productId: _str(json['productId']),
    name: _str(json['name']),
    quantity: _int(json['quantity']),
    lineTotalMinor: _int(json['lineTotalMinor']),
  );
}

/// One participant's share. `mine` is computed by the server from the session.
class BillShareView {
  final String id;
  final String status; // PENDING | PAID | WAIVED | FAILED
  final bool mine;
  final bool participantBound;
  final String? participantHash;
  final int amountMinor;
  final String amountFormatted;
  final String? orderId;

  const BillShareView({
    required this.id,
    required this.status,
    required this.mine,
    required this.participantBound,
    required this.participantHash,
    required this.amountMinor,
    required this.amountFormatted,
    required this.orderId,
  });

  bool get isPaid => status == 'PAID';
  bool get isFailed => status == 'FAILED';

  factory BillShareView.fromJson(Map<String, dynamic> json) => BillShareView(
    id: _str(json['id']),
    status: _str(json['status'], 'PENDING'),
    mine: json['mine'] == true,
    participantBound: json['participantBound'] == true,
    participantHash: json['participantHash'] as String?,
    amountMinor: _int(json['amountMinor']),
    amountFormatted: _str(json['amountFormatted']),
    orderId: json['orderId'] as String?,
  );
}

class BillProgress {
  final int sharesTotal;
  final int sharesPaid;
  final int sharesWaived;
  final int paidMinor;

  const BillProgress({
    required this.sharesTotal,
    required this.sharesPaid,
    required this.sharesWaived,
    required this.paidMinor,
  });

  factory BillProgress.fromJson(Map<String, dynamic>? json) => BillProgress(
    sharesTotal: _int(json?['sharesTotal']),
    sharesPaid: _int(json?['sharesPaid']),
    sharesWaived: _int(json?['sharesWaived']),
    paidMinor: _int(json?['paidMinor']),
  );
}

/// A bill group as returned by `POST /api/bills`, `GET /api/bills/:id` and
/// `POST /api/bills/join`.
class BillView {
  final String id;
  final String status; // OPEN | PARTIALLY_SETTLED | SETTLED | CANCELLED | EXPIRED
  final String currency;
  final int totalMinor;
  final String totalFormatted;
  final bool isOwner;
  final List<BillItemView> items;
  final List<BillShareView> shares;
  final BillProgress progress;

  const BillView({
    required this.id,
    required this.status,
    required this.currency,
    required this.totalMinor,
    required this.totalFormatted,
    required this.isOwner,
    required this.items,
    required this.shares,
    required this.progress,
  });

  bool get isCancelled => status == 'CANCELLED';
  bool get isSettled => status == 'SETTLED';
  bool get isClosed => isCancelled || isSettled || status == 'EXPIRED';

  /// The caller's own share (the server marks it), or `null` when the caller
  /// has not been bound to one yet.
  BillShareView? get myShare {
    for (final s in shares) {
      if (s.mine) return s;
    }
    return null;
  }

  factory BillView.fromJson(Map<String, dynamic> json) => BillView(
    id: _str(json['id']),
    status: _str(json['status'], 'OPEN'),
    currency: _str(json['currency'], 'EUR'),
    totalMinor: _int(json['totalMinor']),
    totalFormatted: _str(json['totalFormatted']),
    isOwner: json['isOwner'] == true,
    items: (json['items'] as List? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(BillItemView.fromJson)
        .toList(),
    shares: (json['shares'] as List? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(BillShareView.fromJson)
        .toList(),
    progress: BillProgress.fromJson(json['progress'] as Map<String, dynamic>?),
  );
}

/// `POST /api/bills/:id/invite` — a signed, single-use, short-lived token.
class BillInvite {
  final String token;
  final int ttlSeconds;
  final String joinPath;

  const BillInvite({
    required this.token,
    required this.ttlSeconds,
    required this.joinPath,
  });

  factory BillInvite.fromJson(Map<String, dynamic> json) => BillInvite(
    token: _str(json['token']),
    ttlSeconds: _int(json['ttlSeconds']),
    joinPath: _str(json['joinUrl']),
  );
}

/// `POST /api/bills/join`.
class BillJoinResult {
  final String shareId;
  final BillView bill;

  const BillJoinResult({required this.shareId, required this.bill});

  factory BillJoinResult.fromJson(Map<String, dynamic> json) => BillJoinResult(
    shareId: _str(json['shareId']),
    bill: BillView.fromJson(
      (json['bill'] as Map<String, dynamic>?) ?? const <String, dynamic>{},
    ),
  );
}

/// `POST /api/bills/:id/shares/:shareId/pay` — a normal PayPal order for one
/// share. Capture goes through the existing `POST /api/orders/:id/capture`.
class BillSharePayStart {
  final String shareId;
  final String orderId;
  final String paypalOrderId;
  final String? approvalUrl;
  final int totalMinor;
  final String currency;

  const BillSharePayStart({
    required this.shareId,
    required this.orderId,
    required this.paypalOrderId,
    required this.approvalUrl,
    required this.totalMinor,
    required this.currency,
  });

  factory BillSharePayStart.fromJson(Map<String, dynamic> json) =>
      BillSharePayStart(
        shareId: _str(json['shareId']),
        orderId: _str(json['orderId']),
        paypalOrderId: _str(json['paypalOrderId']),
        approvalUrl: json['approvalUrl'] as String?,
        totalMinor: _int(json['totalMinor']),
        currency: _str(json['currency'], 'EUR'),
      );
}

/// Extracts the invite token from whatever the shopper pasted: the bare token,
/// a `…/join#t=<token>` link, or a `?t=<token>` link. Returns `''` when the
/// input is empty.
String extractInviteToken(String input) {
  final raw = input.trim();
  if (raw.isEmpty) return '';
  final match = RegExp(r'[#?&]t=([^&#\s]+)').firstMatch(raw);
  final candidate = match != null ? match.group(1)! : raw;
  try {
    return Uri.decodeComponent(candidate);
  } catch (_) {
    return candidate;
  }
}
