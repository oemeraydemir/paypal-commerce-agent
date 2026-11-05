import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import 'package:flutter_app/l10n/app_strings.dart';
import 'package:flutter_app/models/bill.dart';
import 'package:flutter_app/models/cart.dart';
import 'package:flutter_app/services/api_service.dart';
import 'package:flutter_app/theme/app_theme.dart';
import 'package:flutter_app/widgets/refund_section.dart';

/// Split Bill room (parity with the Web `split.html` / `split.js`).
///
/// One merchant receives N independent PayPal payments, one per participant
/// share. Every amount, status and permission is decided by the server; this
/// widget only renders it. Paying a share creates a normal PayPal order for
/// that share, which is approved in PayPal and captured through the same
/// audited `POST /api/orders/:id/capture` route as a regular checkout.
class SplitBillSheet extends StatefulWidget {
  final ApiService api;
  final String lang;

  /// The shopper's current cart (may be empty when they only want to join).
  final List<OrderItem> items;

  /// Saved wellbeing profile; the server requires it before create / pay.
  final Map<String, dynamic> wellbeingPreferences;

  /// Opens the PayPal approval URL. Injectable for tests.
  final Future<bool> Function(Uri url)? launchApproval;

  const SplitBillSheet({
    super.key,
    required this.api,
    required this.lang,
    required this.items,
    required this.wellbeingPreferences,
    this.launchApproval,
  });

  @override
  State<SplitBillSheet> createState() => _SplitBillSheetState();
}

class _SplitBillSheetState extends State<SplitBillSheet>
    with WidgetsBindingObserver {
  static const int _minPeople = 2;
  static const int _maxPeople = 20;

  BillView? _bill;
  int _count = 2;
  bool _busy = false;
  String? _error;
  String? _notice;
  String? _inviteToken;
  String? _pendingOrderId;
  Timer? _poll;
  final TextEditingController _joinCtl = TextEditingController();

  String _s(String key) => AppStrings.get(widget.lang, key);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _poll?.cancel();
    _joinCtl.dispose();
    super.dispose();
  }

  /// Back from the PayPal approval screen: ask the server where the bill stands.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _silentRefresh();
  }

  // ---- state helpers --------------------------------------------------------

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _applyFresh(BillView bill) {
    _bill = bill;
    if (bill.myShare?.isPaid == true) _pendingOrderId = null;
  }

  void _adopt(BillView bill) {
    if (!mounted) return;
    setState(() => _applyFresh(bill));
    _poll?.cancel();
    _poll = bill.isClosed
        ? null
        : Timer.periodic(const Duration(seconds: 6), (_) => _silentRefresh());
  }

  Future<void> _silentRefresh() async {
    final bill = _bill;
    if (bill == null || _busy || !mounted) return;
    try {
      final fresh = await widget.api.getBill(bill.id);
      if (!mounted) return;
      setState(() => _applyFresh(fresh));
      if (fresh.isClosed) _poll?.cancel();
    } catch (_) {
      // Polling is best effort; an explicit action surfaces real errors.
    }
  }

  // ---- actions --------------------------------------------------------------

  Future<void> _create() => _run(() async {
    final bill = await widget.api.createBill(
      items: widget.items,
      participantCount: _count,
      wellbeingPreferences: widget.wellbeingPreferences,
    );
    _adopt(bill);
  });

  Future<void> _join() => _run(() async {
    final token = extractInviteToken(_joinCtl.text);
    if (token.isEmpty) throw ApiException(400, _s('split.tokenRequired'));
    final joined = await widget.api.joinBill(token);
    _adopt(joined.bill);
  });

  Future<void> _invite() => _run(() async {
    final bill = _bill;
    if (bill == null) return;
    final invite = await widget.api.mintBillInvite(bill.id);
    if (mounted) setState(() => _inviteToken = invite.token);
  });

  Future<void> _copyInvite() async {
    final token = _inviteToken;
    if (token == null) return;
    await Clipboard.setData(ClipboardData(text: token));
    if (mounted) setState(() => _notice = _s('split.copied'));
  }

  Future<void> _pay() => _run(() async {
    final bill = _bill;
    final share = bill?.myShare;
    if (bill == null || share == null) return;
    final start = await widget.api.payBillShare(
      billId: bill.id,
      shareId: share.id,
      wellbeingPreferences: widget.wellbeingPreferences,
    );
    final link = start.approvalUrl;
    final uri = link == null ? null : Uri.tryParse(link);
    // Only ever hand an https PayPal link to the system browser.
    if (uri == null || uri.scheme != 'https') {
      throw ApiException(502, _s('split.noLink'));
    }
    if (mounted) {
      setState(() {
        _pendingOrderId = start.orderId;
        _notice = _s('split.captureHint');
      });
    }
    final custom = widget.launchApproval;
    if (custom != null) {
      await custom(uri);
    } else {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  });

  Future<void> _capture() => _run(() async {
    final orderId = _pendingOrderId;
    if (orderId == null) return;
    try {
      await widget.api.captureOrder(orderId);
      if (mounted) {
        setState(() {
          _pendingOrderId = null;
          _notice = _s('split.paidThanks');
        });
      }
    } on ApiException catch (e) {
      // 409 means the server already holds the capture (e.g. the PayPal return
      // link was handled first). The refresh below is the source of truth.
      if (e.statusCode != 409) rethrow;
    }
    final bill = _bill;
    if (bill != null) _adopt(await widget.api.getBill(bill.id));
  });

  Future<void> _refresh() => _run(() async {
    final bill = _bill;
    if (bill == null) return;
    _adopt(await widget.api.getBill(bill.id));
  });

  Future<void> _cancel() => _run(() async {
    final bill = _bill;
    if (bill == null) return;
    _adopt(await widget.api.cancelBill(bill.id));
  });

  // ---- UI -------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final bill = _bill;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          16,
          16,
          16,
          16 + MediaQuery.of(context).viewInsets.bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _s('split.title'),
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 4),
            Text(
              _s('split.subtitle'),
              style: TextStyle(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                fontSize: 12,
              ),
            ),
            const SizedBox(height: 12),
            if (_busy) const LinearProgressIndicator(),
            if (_error != null) _banner(_error!, isError: true),
            if (_notice != null && _error == null) _banner(_notice!),
            if (bill == null) ..._buildStart() else ..._buildRoom(bill),
          ],
        ),
      ),
    );
  }

  Widget _banner(String text, {bool isError = false}) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: isError ? scheme.errorContainer : scheme.primaryContainer,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: isError ? scheme.onErrorContainer : scheme.onPrimaryContainer,
          fontSize: 13,
        ),
      ),
    );
  }

  List<Widget> _buildStart() {
    final hasItems = widget.items.isNotEmpty;
    return [
      if (!hasItems)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Text(_s('split.empty')),
        )
      else ...[
        Row(
          children: [
            Expanded(child: Text(_s('split.people'))),
            IconButton(
              key: const Key('split-minus'),
              icon: const Icon(Icons.remove_circle_outline),
              onPressed: _busy || _count <= _minPeople
                  ? null
                  : () => setState(() => _count--),
            ),
            Text('$_count', style: Theme.of(context).textTheme.titleMedium),
            IconButton(
              key: const Key('split-plus'),
              icon: const Icon(Icons.add_circle_outline),
              onPressed: _busy || _count >= _maxPeople
                  ? null
                  : () => setState(() => _count++),
            ),
          ],
        ),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            key: const Key('split-create'),
            icon: const Icon(Icons.groups_2_outlined),
            label: Text(_s('split.create')),
            onPressed: _busy ? null : _create,
          ),
        ),
      ],
      const Divider(height: 28),
      Text(_s('split.joinTitle'), style: Theme.of(context).textTheme.titleSmall),
      const SizedBox(height: 8),
      TextField(
        key: const Key('split-join-field'),
        controller: _joinCtl,
        enabled: !_busy,
        autocorrect: false,
        decoration: InputDecoration(
          hintText: _s('split.joinHint'),
          border: const OutlineInputBorder(),
          isDense: true,
        ),
      ),
      const SizedBox(height: 8),
      SizedBox(
        width: double.infinity,
        child: OutlinedButton(
          key: const Key('split-join'),
          onPressed: _busy ? null : _join,
          child: Text(_s('split.join')),
        ),
      ),
      const SizedBox(height: 8),
      Text(
        _s('split.notice'),
        style: TextStyle(
          color: Theme.of(context).colorScheme.onSurfaceVariant,
          fontSize: 11,
        ),
      ),
    ];
  }

  List<Widget> _buildRoom(BillView bill) {
    final scheme = Theme.of(context).colorScheme;
    final mine = bill.myShare;
    final canPay =
        mine != null && !mine.isPaid && !mine.isFailed && !bill.isClosed;
    final payLabel = mine == null ? '' : mine.amountFormatted;
    return [
      Row(
        children: [
          Expanded(
            child: Text(
              '${_s('split.total')}: ${bill.totalFormatted}',
              style: Theme.of(context).textTheme.titleLarge,
            ),
          ),
          IconButton(
            tooltip: _s('split.refresh'),
            icon: const Icon(Icons.refresh),
            onPressed: _busy ? null : _refresh,
          ),
        ],
      ),
      const SizedBox(height: 4),
      Text(
        _s('split.progress')
            .replaceFirst('%s', '${bill.progress.sharesPaid}')
            .replaceFirst('%s', '${bill.progress.sharesTotal}'),
        style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
      ),
      const SizedBox(height: 6),
      LinearProgressIndicator(
        value: bill.progress.sharesTotal == 0
            ? 0
            : bill.progress.sharesPaid / bill.progress.sharesTotal,
        minHeight: 8,
        borderRadius: BorderRadius.circular(8),
      ),
      if (bill.isSettled) _banner(_s('split.settled')),
      if (bill.isCancelled) _banner(_s('split.cancelled'), isError: true),
      const SizedBox(height: 8),
      ...bill.items.map(
        (i) => Text(
          '${i.quantity}× ${i.name}',
          style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
        ),
      ),
      const Divider(height: 24),
      ...bill.shares.map(_shareRow),
      // A paid share is a normal (captured) order owned by this session, so the
      // same customer refund section shown on receipts is available here too.
      if (mine != null && mine.isPaid && mine.orderId != null) ...[
        const SizedBox(height: 4),
        RefundSection(
          api: widget.api,
          orderId: mine.orderId!,
          lang: widget.lang,
        ),
      ],
      const SizedBox(height: 8),
      if (canPay && _pendingOrderId == null)
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            key: const Key('split-pay'),
            icon: const Icon(Icons.payment),
            label: Text('${_s('split.pay')} · $payLabel'),
            onPressed: _busy ? null : _pay,
          ),
        ),
      if (canPay && _pendingOrderId != null) ...[
        Text(
          _s('split.captureHint'),
          style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
        ),
        const SizedBox(height: 6),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            key: const Key('split-capture'),
            icon: const Icon(Icons.verified_outlined),
            label: Text(_s('split.capture')),
            onPressed: _busy ? null : _capture,
          ),
        ),
        TextButton(
          onPressed: _busy ? null : _pay,
          child: Text(_s('split.reopen')),
        ),
      ],
      if (bill.isOwner && !bill.isClosed) ...[
        const SizedBox(height: 8),
        OutlinedButton.icon(
          key: const Key('split-invite'),
          icon: const Icon(Icons.person_add_alt_1_outlined),
          label: Text(_s('split.invite')),
          onPressed: _busy ? null : _invite,
        ),
        if (_inviteToken != null) ...[
          const SizedBox(height: 8),
          Text(_s('split.inviteReady'), style: const TextStyle(fontSize: 12)),
          const SizedBox(height: 4),
          Row(
            children: [
              Expanded(
                child: SelectableText(
                  _inviteToken!,
                  key: const Key('split-invite-token'),
                  maxLines: 3,
                  style: const TextStyle(fontSize: 11),
                ),
              ),
              IconButton(
                tooltip: _s('split.copy'),
                icon: const Icon(Icons.copy),
                onPressed: _copyInvite,
              ),
            ],
          ),
        ],
        TextButton(
          key: const Key('split-cancel'),
          onPressed: _busy ? null : _cancel,
          child: Text(
            _s('split.cancel'),
            style: TextStyle(color: scheme.error),
          ),
        ),
      ],
      const SizedBox(height: 4),
      Text(
        _s('split.notice'),
        style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 11),
      ),
    ];
  }

  Widget _shareRow(BillShareView share) {
    final scheme = Theme.of(context).colorScheme;
    final IconData icon;
    final Color color;
    final String status;
    if (share.isPaid) {
      icon = Icons.check_circle;
      color = AppColors.success;
      status = _s('split.paid');
    } else if (share.isFailed) {
      icon = Icons.error_outline;
      color = scheme.error;
      status = _s('split.failed');
    } else {
      icon = Icons.hourglass_bottom;
      color = scheme.onSurfaceVariant;
      status = _s('split.pending');
    }
    final hash = share.participantHash;
    final who = share.mine
        ? _s('split.you')
        : !share.participantBound
        ? _s('split.openSeat')
        : '${_s('split.guest')} ${hash == null || hash.length < 4 ? '' : hash.substring(0, 4)}'
              .trim();
    return ListTile(
      dense: true,
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon, color: color),
      title: Text(
        '$who · ${share.amountFormatted}',
        style: TextStyle(
          fontWeight: share.mine ? FontWeight.w700 : FontWeight.w500,
        ),
      ),
      trailing: Text(status, style: TextStyle(color: color, fontSize: 12)),
    );
  }
}
