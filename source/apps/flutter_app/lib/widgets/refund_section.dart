import 'package:flutter/material.dart';

import 'package:flutter_app/l10n/app_strings.dart';
import 'package:flutter_app/models/refund.dart';
import 'package:flutter_app/services/api_service.dart';

/// Customer refund section on the receipt (parity with the Web storefront's
/// refund block).
///
/// Requesting a refund never moves money: it only submits a PROPOSED refund
/// that a merchant must review and approve. The client renders exactly what the
/// server reports (customer-safe view) and never invents a refund outcome.
class RefundSection extends StatefulWidget {
  final ApiService api;
  final String orderId;
  final String lang;

  const RefundSection({
    super.key,
    required this.api,
    required this.orderId,
    required this.lang,
  });

  @override
  State<RefundSection> createState() => _RefundSectionState();
}

class _RefundSectionState extends State<RefundSection> {
  RefundStatusView? _status;
  bool _loading = false;
  bool _failed = false;
  String _selectedReason = kRefundReasons.first;
  final TextEditingController _note = TextEditingController();
  bool _sending = false;
  String? _error;

  String _s(String key) => AppStrings.get(widget.lang, key);

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'UNDER_REVIEW':
        return _s('refund.status.review');
      case 'BEING_PROCESSED':
        return _s('refund.status.processing');
      case 'REFUNDED':
        return _s('refund.status.refunded');
      case 'DECLINED':
        return _s('refund.status.declined');
      default:
        return _s('refund.status.review');
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      final status = await widget.api.fetchRefundStatus(widget.orderId);
      if (!mounted) return;
      setState(() {
        _status = status;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _failed = true;
      });
    }
  }

  Future<void> _request() async {
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await widget.api.requestRefund(
        orderId: widget.orderId,
        reason: _selectedReason,
        note: _note.text,
      );
      if (!mounted) return;
      await _load();
      if (!mounted) return;
      setState(() => _sending = false);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = '${_s('refund.failed')}${e.message}';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = '${_s('refund.failed')}$e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _s('refund.title'),
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 2),
          Text(
            _s('refund.subtitle'),
            style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
          ),
          const SizedBox(height: 8),
          if (_loading) const LinearProgressIndicator(),
          if (_failed) ...[
            Text(
              _s('refund.unavailable'),
              style: TextStyle(color: scheme.error, fontSize: 12),
            ),
            TextButton(
              onPressed: _load,
              child: const Text('Retry'),
            ),
          ],
          if (_status != null) _statusBody(scheme, _status!),
        ],
      ),
    );
  }

  Widget _statusBody(ColorScheme scheme, RefundStatusView status) {
    if (status.refunds.isNotEmpty) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final r in status.refunds)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(child: Text(_statusLabel(r.status))),
                  Text(
                    AppStrings.formatMoney(
                      widget.lang,
                      r.amountMinor,
                      status.currency,
                    ),
                  ),
                ],
              ),
            ),
        ],
      );
    }
    if (status.canRequest) return _requestForm(scheme);
    return Text(
      _s('refund.noRefundable'),
      style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
    );
  }

  Widget _requestForm(ColorScheme scheme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        DropdownButtonFormField<String>(
          key: const Key('refund-reason'),
          initialValue: _selectedReason,
          decoration: InputDecoration(
            labelText: _s('refund.reasonLabel'),
            border: const OutlineInputBorder(),
            isDense: true,
          ),
          items: [
            for (final code in kRefundReasons)
              DropdownMenuItem(value: code, child: Text(_s('refund.reason.$code'))),
          ],
          onChanged: (value) {
            if (value != null) setState(() => _selectedReason = value);
          },
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _note,
          key: const Key('refund-note'),
          maxLength: 120,
          decoration: InputDecoration(
            labelText: _s('refund.note'),
            border: const OutlineInputBorder(),
            isDense: true,
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 4),
          Text(
            _error!,
            style: TextStyle(color: scheme.error, fontSize: 12),
          ),
        ],
        const SizedBox(height: 4),
        FilledButton(
          key: const Key('refund-submit'),
          onPressed: _sending ? null : _request,
          child: Text(_sending ? _s('refund.sending') : _s('refund.request')),
        ),
      ],
    );
  }
}
