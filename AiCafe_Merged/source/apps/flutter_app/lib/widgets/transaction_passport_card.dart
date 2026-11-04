import 'package:flutter/material.dart';

import 'package:flutter_app/l10n/app_strings.dart';
import 'package:flutter_app/models/transaction_passport.dart';
import 'package:flutter_app/theme/app_theme.dart';
import 'package:flutter_app/theme/tokens.g.dart';

/// AI Transaction Passport card: why this cart, which rules, who decides.
///
/// Mirrors the web passport (same copy keys, same pastel actor chips, same limit bar with the
/// approval-threshold marker). It only draws the server's [TransactionPassport]; it never
/// evaluates a rule and never offers any way for the AI to pay.
class TransactionPassportCard extends StatelessWidget {
  const TransactionPassportCard({
    super.key,
    required this.passport,
    required this.lang,
  });

  final TransactionPassport passport;
  final String lang;

  String _s(String key) => AppStrings.get(lang, key);

  String _money(int minor) {
    final symbol = switch (passport.currency) {
      'EUR' => '€',
      'USD' => r'$',
      'GBP' => '£',
      _ => '${passport.currency} ',
    };
    return '$symbol${(minor / 100).toStringAsFixed(2)}';
  }

  /// Pastel chip colours per actor (same pairs as the web `.pp-actor`).
  (Color, Color) _actorColors(String actor) => switch (actor) {
    'ai' => (AcLight.lavender, AcLight.lavenderInk),
    'server' => (AcLight.sky, AcLight.skyInk),
    'shopper' => (AcLight.peach, AcLight.peachInk),
    _ => (AcLight.mint, AcLight.mintInk),
  };

  @override
  Widget build(BuildContext context) {
    final p = passport;
    final textTheme = Theme.of(context).textTheme;
    return Container(
      key: const Key('transaction-passport'),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(AcShape.radiusCard),
        border: Border.all(color: AppColors.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _s('passport.title'),
                      style: textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Text(
                      _s('passport.sub'),
                      style: textTheme.bodySmall?.copyWith(
                        color: AppColors.inkMuted,
                      ),
                    ),
                  ],
                ),
              ),
              Text(
                _money(p.totalMinor),
                style: textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          _section(textTheme, _s('passport.why')),
          for (final k in const ['passport.why1', 'passport.why2', 'passport.why3'])
            _bullet(textTheme, _s(k)),
          for (final l in p.lines)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Row(
                children: [
                  Expanded(child: Text('${l.quantity} × ${l.name}')),
                  Text(_money(l.lineTotalMinor)),
                ],
              ),
            ),
          const SizedBox(height: 14),
          _section(textTheme, _s('passport.control')),
          _limitBar(textTheme),
          const SizedBox(height: 8),
          _bullet(
            textTheme,
            p.withinLimit ? _s('passport.within') : _s('passport.over'),
          ),
          _bullet(textTheme, _s('passport.nochange')),
          if (p.requiresShopperApproval)
            _bullet(textTheme, _s('passport.wait')),
          const SizedBox(height: 8),
          Container(
            key: const Key('passport-authority'),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: AcLight.mint,
              borderRadius: BorderRadius.circular(AcShape.radiusControl),
            ),
            child: Row(
              children: [
                const Icon(Icons.lock_outline, size: 18, color: AcLight.mintInk),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '${_s('passport.nochange')} · ${_s('passport.authority')}: ${_s('passport.you')}',
                    style: textTheme.bodyMedium?.copyWith(
                      color: AcLight.mintInk,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          _section(textTheme, _s('passport.flow')),
          for (final step in p.steps) _stepRow(textTheme, step),
          const SizedBox(height: 10),
          for (final n in p.notices) _notice(textTheme, n),
          Text(
            _s('passport.preview'),
            style: textTheme.bodySmall?.copyWith(color: AppColors.inkMuted),
          ),
        ],
      ),
    );
  }

  Widget _section(TextTheme t, String text) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(text, style: t.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
  );

  Widget _bullet(TextTheme t, String text) => Padding(
    padding: const EdgeInsets.only(top: 2),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('• '),
        Expanded(child: Text(text, style: t.bodyMedium)),
      ],
    ),
  );

  Widget _notice(TextTheme t, String code) {
    final key = switch (code) {
      'sample-menu-data' => 'passport.n.sample',
      'allergen-unverified' => 'passport.n.allergen',
      'sandbox-only' => 'passport.n.sandbox',
      _ => '',
    };
    if (key.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Text(
        _s(key),
        style: t.bodySmall?.copyWith(color: AppColors.inkMuted),
      ),
    );
  }

  Widget _stepRow(TextTheme t, PassportStep step) {
    final (bg, fg) = _actorColors(step.actor);
    final icon = switch (step.state) {
      'done' => Icons.check_circle,
      'blocked' => Icons.block,
      _ => Icons.radio_button_unchecked,
    };
    final iconColor = switch (step.state) {
      'done' => AcLight.ok,
      'blocked' => AcLight.bad,
      _ => AppColors.inkMuted,
    };
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Icon(icon, size: 18, color: iconColor),
          const SizedBox(width: 8),
          Expanded(child: Text(_s('passport.s.${step.key}'), style: t.bodyMedium)),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 2),
            decoration: BoxDecoration(
              color: bg,
              borderRadius: BorderRadius.circular(AcShape.radiusPill),
            ),
            child: Text(
              _s('passport.actor.${step.actor}'),
              style: t.labelSmall?.copyWith(color: fg, fontWeight: FontWeight.w800),
            ),
          ),
        ],
      ),
    );
  }

  /// Limit bar. Fill and threshold marker use the server-computed percentages.
  Widget _limitBar(TextTheme t) {
    final m = passport.mandate;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          height: 18,
          child: LayoutBuilder(
            builder: (context, box) {
              final w = box.maxWidth;
              return Stack(
                clipBehavior: Clip.none,
                children: [
                  Positioned(
                    left: 0,
                    right: 0,
                    top: 3,
                    height: 12,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: AppColors.surfaceAltHigh,
                        borderRadius: BorderRadius.circular(AcShape.radiusPill),
                      ),
                    ),
                  ),
                  Positioned(
                    left: 0,
                    top: 3,
                    height: 12,
                    width: w * m.usedPercent / 100,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: AcGradient.coral,
                        borderRadius: BorderRadius.circular(AcShape.radiusPill),
                      ),
                    ),
                  ),
                  if (m.thresholdPercent > 0 && m.thresholdPercent < 100)
                    Positioned(
                      key: const Key('passport-threshold-marker'),
                      left: w * m.thresholdPercent / 100 - 1.5,
                      top: 0,
                      height: 18,
                      width: 3,
                      child: const DecoratedBox(
                        decoration: BoxDecoration(color: AcLight.ink),
                      ),
                    ),
                ],
              );
            },
          ),
        ),
        const SizedBox(height: 4),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              '${m.usedPercent}% ${_s('passport.used')}',
              style: t.bodySmall?.copyWith(color: AppColors.inkMuted),
            ),
            Text(
              '${_s('passport.threshold')}: ${_money(m.approvalThresholdMinor)} · max ${_money(m.maxPerPurchaseMinor)}',
              style: t.bodySmall?.copyWith(color: AppColors.inkMuted),
            ),
          ],
        ),
      ],
    );
  }
}
