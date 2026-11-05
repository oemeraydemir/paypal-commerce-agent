import 'package:flutter/material.dart';

import 'package:flutter_app/l10n/app_strings.dart';
import 'package:flutter_app/models/allowance_scope.dart';
import 'package:flutter_app/services/api_service.dart';

/// Scoped AI Allowance management surface for the shopper (profile screen).
///
/// Lists the shopper's own scopes, lets them approve pending (agent-proposed)
/// scopes, revoke active ones, and create new shopper scopes. Every mutation is
/// server-authoritative and fail-closed; the client never enforces or invents
/// limits. This section is presentational only.
class ScopesSection extends StatefulWidget {
  final ApiService api;
  final String lang;

  const ScopesSection({super.key, required this.api, required this.lang});

  @override
  State<ScopesSection> createState() => _ScopesSectionState();
}

class _ScopesSectionState extends State<ScopesSection> {
  List<AllowanceScope>? _scopes;
  bool _loading = false;
  bool _failed = false;
  String? _errorMsg;
  final TextEditingController _label = TextEditingController();
  final TextEditingController _daily = TextEditingController();
  bool _creating = false;

  String _s(String key) => AppStrings.get(widget.lang, key);

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _label.dispose();
    _daily.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _failed = false;
      _errorMsg = null;
    });
    try {
      final scopes = await widget.api.getScopes();
      if (!mounted) return;
      setState(() {
        _scopes = scopes;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _failed = true;
        _errorMsg = e is ApiException ? e.message : '$e';
      });
    }
  }

  Future<void> _approve(AllowanceScope scope) async {
    try {
      await widget.api.approveScope(scope.id);
      await _load();
    } catch (e) {
      _showError('${scope.label}: ${e is ApiException ? e.message : e}');
    }
  }

  Future<void> _revoke(AllowanceScope scope) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(_s('scope.revoke')),
        content: Text('${_s('scope.label')} ${scope.label}'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(_s('action.cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(_s('scope.revoke')),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await widget.api.revokeScope(scope.id);
      await _load();
    } catch (e) {
      _showError('${scope.label}: ${e is ApiException ? e.message : e}');
    }
  }

  Future<void> _create() async {
    final label = _label.text.trim();
    if (label.isEmpty) {
      _showError(_s('scope.label'));
      return;
    }
    final dailyMinor = double.tryParse(_daily.text.trim());
    setState(() => _creating = true);
    try {
      await widget.api.createScope(
        label: label,
        dailySpendLimitMinor: (dailyMinor == null || dailyMinor <= 0)
            ? null
            : (dailyMinor * 100).round(),
      );
      _label.clear();
      _daily.clear();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_s('scope.created'))),
      );
      await _load();
    } catch (e) {
      _showError(e is ApiException ? e.message : '$e');
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  void _showError(String msg) {
    if (!mounted) return;
    setState(() => _errorMsg = msg);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _title(scheme),
        const SizedBox(height: 4),
        Text(
          _s('scope.hint'),
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
        ),
        const SizedBox(height: 12),
        if (_loading)
          const Padding(
            padding: EdgeInsets.all(8),
            child: Center(child: CircularProgressIndicator()),
          )
        else if (_failed)
          _row(_s('scope.error'), scheme)
        else if (_scopes == null || _scopes!.isEmpty)
          Text(_s('scope.empty'),
              style: TextStyle(color: scheme.onSurfaceVariant))
        else
          ..._scopes!.map((s) => _scopeCard(s, scheme)),
        if (_errorMsg != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              _errorMsg!,
              style: TextStyle(color: scheme.error, fontSize: 13),
            ),
          ),
        const SizedBox(height: 14),
        _createForm(scheme),
      ],
    );
  }

  Widget _title(ColorScheme scheme) {
    return Text(
      _s('scope.panelTitle'),
      style: Theme.of(context).textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w800,
          ),
    );
  }

  Widget _row(String text, ColorScheme scheme) {
    return Text(text, style: TextStyle(color: scheme.onSurfaceVariant));
  }

  Widget _statusPill(AllowanceScope s, ColorScheme scheme) {
    final (label, color) = switch (s.status) {
      'ACTIVE' => (_s('scope.status.active'), scheme.primary),
      'PENDING_APPROVAL' => (_s('scope.status.pending'), scheme.tertiary),
      'REVOKED' => (_s('scope.status.revoked'), scheme.outline),
      'EXPIRED' => (_s('scope.status.expired'), scheme.outline),
      'SPENT' => (_s('scope.status.spent'), scheme.outline),
      _ => (s.status, scheme.outline),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700),
      ),
    );
  }

  Widget _scopeCard(AllowanceScope s, ColorScheme scheme) {
    final daily = s.dailySpendLimitMinor != null
        ? AppStrings.formatMoney(widget.lang, s.dailySpendLimitMinor!, s.currency)
        : null;
    final perPurchase = s.maxPerPurchaseMinor != null
        ? AppStrings.formatMoney(widget.lang, s.maxPerPurchaseMinor!, s.currency)
        : null;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  s.label,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              _statusPill(s, scheme),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            _s('scope.currency').replaceAll('%s', s.currency),
            style: TextStyle(fontSize: 12.5, color: scheme.onSurfaceVariant),
          ),
          if (daily != null)
            Text(
              '${_s('scope.daily')} $daily',
              style: TextStyle(fontSize: 12.5, color: scheme.onSurfaceVariant),
            ),
          if (perPurchase != null)
            Text(
              _s('scope.limitPerPurchase').replaceAll('%s', perPurchase),
              style: TextStyle(fontSize: 12.5, color: scheme.onSurfaceVariant),
            ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              if (s.pendingApproval)
                FilledButton.tonal(
                  onPressed: () => _approve(s),
                  child: Text(_s('scope.approve')),
                )
              else if (s.active)
                FilledButton(
                  onPressed: () => _revoke(s),
                  style: FilledButton.styleFrom(
                    backgroundColor: scheme.errorContainer,
                    foregroundColor: scheme.onErrorContainer,
                  ),
                  child: Text(_s('scope.revoke')),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _createForm(ColorScheme scheme) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _s('scope.create'),
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _label,
            decoration: InputDecoration(
              labelText: _s('scope.label'),
              isDense: true,
              border: const OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _daily,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: _s('scope.daily'),
              isDense: true,
              border: const OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton.tonal(
              onPressed: _creating ? null : _create,
              child: _creating
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(_s('scope.submit')),
            ),
          ),
        ],
      ),
    );
  }
}
