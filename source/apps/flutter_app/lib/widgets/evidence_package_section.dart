import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import 'package:flutter_app/l10n/app_strings.dart';
import 'package:flutter_app/models/evidence_package.dart';
import 'package:flutter_app/services/api_service.dart';

/// The Dispute Evidence Package section of the receipt.
///
/// Shows the Order-to-Resolution Passport (order, the policy decisions the
/// server actually enforced, the human approval and the capture), the rule
/// details the server recorded, the dispute-defense statement, the integrity
/// block and an independent verification.
///
/// The package is prepared for PRESENTATION only: it is never submitted to
/// PayPal automatically, and nothing here is ever inferred locally — every
/// value comes from the server's signed payload. When a server field is absent
/// (older backends) the section degrades gracefully and never breaks the
/// receipt.
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
  bool _rulesExpanded = false;
  bool _disputeExpanded = false;
  bool _copied = false;

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

  String _stepLabel(String kind) {
    switch (kind) {
      case 'ORDER_CREATED':
        return _s('evidence.step.created');
      case 'POLICY_EVALUATED':
        return _s('evidence.step.policy');
      case 'HUMAN_APPROVAL':
        return _s('evidence.step.approval');
      case 'PAYMENT_CAPTURED':
        return _s('evidence.step.captured');
      default:
        return kind;
    }
  }

  String _stepIcon(String kind) {
    switch (kind) {
      case 'ORDER_CREATED':
        return '🛍️';
      case 'POLICY_EVALUATED':
        return '⚖️';
      case 'HUMAN_APPROVAL':
        return '✍️';
      case 'PAYMENT_CAPTURED':
        return '💰';
      default:
        return '•';
    }
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

  Future<void> _copyNarrative(EvidenceDisputeDefense defense) async {
    await Clipboard.setData(ClipboardData(text: defense.narrative));
    if (!mounted) return;
    setState(() => _copied = true);
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
            if (_hasRules) ...[
              const SizedBox(height: 8),
              _rulesBlock(scheme),
            ],
            if (_pkg!.disputeDefense != null) ...[
              const SizedBox(height: 8),
              _disputeBlock(scheme, _pkg!.disputeDefense!),
            ],
            const SizedBox(height: 8),
            _integrity(scheme),
            const SizedBox(height: 6),
            _verifyRow(scheme),
          ],
        ],
      ),
    );
  }

  bool get _hasRules =>
      _pkg!.policyEvents.any((e) => e.ruleDetails.isNotEmpty);

  // The Order-to-Resolution Passport. When the server sends a timeline we
  // render it verbatim (it is the authoritative, chronological record).
  // Otherwise we fall back to composing one from the order + policy events.
  Widget _passport(ColorScheme scheme) {
    final pkg = _pkg!;
    final rows = <Widget>[];

    if (pkg.timeline.isNotEmpty) {
      for (final step in pkg.timeline) {
        final detail = step.decision.isNotEmpty
            ? '[${step.decision}]${step.detail.isEmpty ? '' : ' ${step.detail}'}'
            : step.detail;
        rows.add(
          _step(
            scheme,
            _stepLabel(step.step),
            detail,
            _stamp(step.at),
            icon: _stepIcon(step.step),
          ),
        );
      }
    } else {
      rows.add(
        _step(scheme, _s('evidence.step.created'), pkg.orderId,
            _stamp(pkg.orderCreatedAt)),
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

  // Collapsible list of the rule details the server recorded (which rule
  // fired, expected vs actual). Grouped by the policy event that produced them.
  Widget _rulesBlock(ColorScheme scheme) {
    final rows = <Widget>[];
    for (final event in _pkg!.policyEvents) {
      if (event.ruleDetails.isEmpty) continue;
      for (final rule in event.ruleDetails) {
        rows.add(
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${rule.type} — ${rule.rule}',
                  style: const TextStyle(fontSize: 12),
                ),
                if (rule.message.isNotEmpty)
                  Text(
                    rule.message,
                    style: TextStyle(
                      color: scheme.onSurfaceVariant,
                      fontSize: 11,
                    ),
                  ),
                Text(
                  '${_s('evidence.rule.expected')}: ${rule.expected.isEmpty ? '—' : rule.expected} · '
                  '${_s('evidence.rule.actual')}: ${rule.actual.isEmpty ? '—' : rule.actual}',
                  style: TextStyle(
                    color: scheme.onSurfaceVariant,
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ),
        );
      }
    }

    return _expando(
      scheme,
      expanded: _rulesExpanded,
      title: _s('evidence.rule.title'),
      subtitle: '${_pkg!.policyEvents.fold<int>(0, (n, e) => n + e.ruleDetails.length)}',
      onToggle: () => setState(() => _rulesExpanded = !_rulesExpanded),
      icon: Icons.rule,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: rows),
    );
  }

  // Collapsible dispute-defense statement with the narrative and a copy action.
  // The narrative is presented as evidence, never as a guaranteed win.
  Widget _disputeBlock(ColorScheme scheme, EvidenceDisputeDefense defense) {
    return _expando(
      scheme,
      expanded: _disputeExpanded,
      title: _s('evidence.dispute.title'),
      subtitle: defense.claimType,
      onToggle: () => setState(() => _disputeExpanded = !_disputeExpanded),
      icon: Icons.description_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _s('evidence.dispute.note'),
            style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 11),
          ),
          const SizedBox(height: 6),
          Text(
            defense.narrative,
            style: const TextStyle(fontSize: 12, height: 1.4),
          ),
          const SizedBox(height: 6),
          TextButton.icon(
            icon: Icon(_copied ? Icons.check : Icons.copy, size: 16),
            label: Text(
              _copied ? _s('evidence.dispute.copied') : _s('evidence.dispute.copy'),
            ),
            onPressed: () => _copyNarrative(defense),
          ),
        ],
      ),
    );
  }

  // A lightweight collapsible section (no extra dependency).
  Widget _expando(
    ColorScheme scheme, {
    required bool expanded,
    required String title,
    required String subtitle,
    required VoidCallback onToggle,
    required IconData icon,
    required Widget child,
  }) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            onTap: onToggle,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              child: Row(
                children: [
                  Icon(icon, size: 18, color: scheme.primary),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                          ),
                        ),
                        if (subtitle.isNotEmpty)
                          Text(
                            subtitle,
                            style: TextStyle(
                              color: scheme.onSurfaceVariant,
                              fontSize: 11,
                            ),
                          ),
                      ],
                    ),
                  ),
                  Icon(
                    expanded ? Icons.expand_less : Icons.expand_more,
                    size: 20,
                  ),
                ],
              ),
            ),
          ),
          if (expanded)
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
              child: child,
            ),
        ],
      ),
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
