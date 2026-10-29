import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'package:flutter_app/l10n/app_strings.dart';
import 'package:flutter_app/models/evidence_package.dart';
import 'package:flutter_app/services/api_service.dart';

/// The Dispute Evidence Package section of the receipt.
///
/// Shows the Order-to-Resolution Passport (order, the policy decisions the
/// server actually enforced, the human approval and the capture), the
/// integrity block and an independent verification.
///
/// The package is prepared for PRESENTATION only: it is never submitted to
/// PayPal automatically, and nothing here is ever inferred locally — every
/// value comes from the server's signed payload.
class EvidencePackageSection extends StatefulWidget {
  final ApiService api;
  final String orderId;
  final String lang;

  const EvidencePackageSection({
    super.key,
    required this.api,
    required this.orderId,
    required this.lang,
  });

  @override
  State<EvidencePackageSection> createState() => _EvidencePackageSectionState();
}

class _EvidencePackageSectionState extends State<EvidencePackageSection> {
  EvidencePackage? _pkg;
  EvidenceVerification? _verification;
  bool _loading = false;
  bool _failed = false;
  bool _verifying = false;

  String _s(String key) => AppStrings.get(widget.lang, key);

  String _stamp(DateTime? when) {
    if (when == null) return '';
    try {
      return DateFormat(
        'yyyy-MM-dd HH:mm',
        AppStrings.localeTag(widget.lang),
      ).format(when);
    } catch (_) {
      return when.toIso8601String();
    }
  }

  String _short(String digest) {
    if (digest.isEmpty) return '—';
    if (digest.length <= 16) return digest;
    return '${digest.substring(0, 16)}…';
  }

  Future<void> _load() async {
    if (_loading || _pkg != null) return;
    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      final pkg = await widget.api.getEvidence(widget.orderId);
      if (!mounted) return;
      setState(() {
        _pkg = pkg;
        _loading = false;
        _failed = pkg == null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _failed = true;
      });
    }
  }

  Future<void> _verify() async {
    final pkg = _pkg;
    if (pkg == null || _verifying) return;
    setState(() => _verifying = true);
    try {
      final v = await widget.api.verifyEvidence(pkg);
      if (!mounted) return;
      setState(() {
        _verification = v;
        _verifying = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _verifying = false);
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
            _s('evidence.title'),
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 2),
          Text(
            _s('evidence.subtitle'),
            style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
          ),
          const SizedBox(height: 6),
          if (_pkg == null && !_failed)
            TextButton.icon(
              icon: const Icon(Icons.folder_open, size: 18),
              label: Text(
                _loading ? _s('evidence.loading') : _s('evidence.open'),
              ),
              onPressed: _loading ? null : _load,
            ),
          if (_loading) const LinearProgressIndicator(),
          if (_failed)
            Text(
              _s('evidence.error'),
              style: TextStyle(color: scheme.error, fontSize: 12),
            ),
          if (_pkg != null) ...[
            _passport(scheme),
            const SizedBox(height: 8),
            _integrity(scheme),
            const SizedBox(height: 6),
            _verifyRow(scheme),
          ],
        ],
      ),
    );
  }

  // The Order-to-Resolution Passport: order, policy decisions, human approval
  // and capture, in one timeline.
  Widget _passport(ColorScheme scheme) {
    final pkg = _pkg!;
    final rows = <Widget>[];

    rows.add(
      _step(
        scheme,
        _s('evidence.step.created'),
        pkg.orderId,
        _stamp(pkg.orderCreatedAt),
      ),
    );

    for (final event in pkg.policyEvents) {
      final detail = event.violatedRules.isEmpty
          ? event.reason
          : (event.reason.isEmpty
                ? event.violatedRules.join(', ')
                : '${event.reason} · ${event.violatedRules.join(', ')}');
      rows.add(
        _step(
          scheme,
          '${_s('evidence.step.policy')} — ${event.decision}',
          detail,
          _stamp(event.timestamp),
        ),
      );
    }
    if (pkg.policyEvents.isEmpty) {
      rows.add(
        _step(scheme, _s('evidence.noPolicyEvents'), '', '', icon: '·'),
      );
    }

    final approval = switch (pkg.approvalState) {
      'approved' => _s('evidence.approval.approved'),
      'awaiting_approval' => _s('evidence.approval.awaiting'),
      _ => _s('evidence.approval.notRecorded'),
    };
    rows.add(_step(scheme, _s('evidence.step.approval'), approval, ''));

    if (pkg.captureId != null) {
      rows.add(
        _step(
          scheme,
          _s('evidence.step.captured'),
          pkg.captureId!,
          _stamp(pkg.orderUpdatedAt),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _s('evidence.passport'),
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
        ),
        const SizedBox(height: 4),
        ...rows,
      ],
    );
  }

  Widget _step(
    ColorScheme scheme,
    String title,
    String detail,
    String when, {
    String icon = '✓',
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 20, child: Text(icon)),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontSize: 13)),
                if (detail.isNotEmpty)
                  Text(
                    detail,
                    style: TextStyle(
                      color: scheme.onSurfaceVariant,
                      fontSize: 12,
                    ),
                  ),
                if (when.isNotEmpty)
                  Text(
                    when,
                    style: TextStyle(
                      color: scheme.onSurfaceVariant,
                      fontSize: 11,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _integrity(ColorScheme scheme) {
    final pkg = _pkg!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '${_s('evidence.integrity')}: ${pkg.alg.isEmpty ? '—' : pkg.alg} · key ${pkg.kid.isEmpty ? '—' : pkg.kid}',
          style: const TextStyle(fontSize: 12),
        ),
        Text(
          '${_s('evidence.digest')}: ${_short(pkg.digest)}',
          style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 11),
        ),
        Text(
          _s('evidence.exportNote'),
          style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 11),
        ),
      ],
    );
  }

  Widget _verifyRow(ColorScheme scheme) {
    final v = _verification;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextButton.icon(
          icon: const Icon(Icons.verified_user, size: 18),
          label: Text(
            _verifying ? _s('evidence.verifying') : _s('evidence.verify'),
          ),
          onPressed: _verifying ? null : _verify,
        ),
        if (v != null)
          Text(
            v.valid ? '✓ ${_s('evidence.valid')}' : '✗ ${_s('evidence.invalid')}',
            style: TextStyle(
              color: v.valid ? scheme.primary : scheme.error,
              fontSize: 12,
            ),
          ),
        if (v != null)
          Text(
            '${_s('evidence.check.signature')}: ${_yn(v.signature)} · '
            '${_s('evidence.check.digest')}: ${_yn(v.digest)} · '
            '${_s('evidence.check.mandate')}: ${_yn(v.mandateValid)} · '
            '${_s('evidence.check.order')}: ${_yn(v.matchesOrder)}',
            style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 11),
          ),
      ],
    );
  }

  String _yn(bool value) => value ? 'yes' : 'no';
}
