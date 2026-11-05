import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'package:flutter_app/l10n/app_strings.dart';
import 'package:flutter_app/models/shopper_preferences.dart';
import 'package:flutter_app/providers/locale_provider.dart';
import 'package:flutter_app/providers/shopper_profile_provider.dart';
import 'package:flutter_app/screens/profile_settings_screen.dart';
import 'package:flutter_app/services/api_service.dart';
import 'package:flutter_app/widgets/scopes_section.dart';

/// A richer profile surface that ties the shopper's local preferences together
/// with how AI + PayPal work together to make the café more efficient, and
/// communicates the merchant value of adding PayPal to a café/shop.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  Future<void> _editPreferences(BuildContext context) async {
    final profile = context.read<ShopperProfileProvider>();
    final preferences = await Navigator.of(context).push<ShopperPreferences>(
      MaterialPageRoute(
        builder: (_) =>
            ProfileSettingsScreen(initialPreferences: profile.preferences),
      ),
    );
    if (preferences == null || !context.mounted) return;
    await profile.save(preferences);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(title: Text(t(context, 'action.profile'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          // ---- Shopper profile (preferences) ----
          _sectionHeader(context, t(context, 'profile.sectionPrefs')),
          _groupCard(
            context,
            child: Consumer<ShopperProfileProvider>(
              builder: (context, profile, _) {
                final lang =
                    Provider.of<LocaleProvider>(context, listen: false)
                        .languageCode;
                final p = profile.preferences;
                final dietary = p.dietary
                    .map((k) => ShopperPreferences.dietaryLabel(lang, k))
                    .toList()
                  ..sort();
                final allergens = p.allergens
                    .map((k) => ShopperPreferences.allergenLabel(lang, k))
                    .toList()
                  ..sort();
                final budget = p.maxBudgetMinor != null
                    ? AppStrings.formatMoney(lang, p.maxBudgetMinor!, 'EUR')
                    : null;

                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _prefRow(context, Icons.restaurant_menu,
                        t(context, 'profile.dietary'), dietary),
                    const SizedBox(height: 8),
                    _prefRow(context, Icons.warning_amber_rounded,
                        t(context, 'profile.allergenTitle'), allergens),
                    const SizedBox(height: 8),
                    _prefRow(context, Icons.account_balance_wallet_outlined,
                        t(context, 'profile.budgetLabel'),
                        budget == null ? const [] : [budget]),
                    const SizedBox(height: 12),
                    Align(
                      alignment: Alignment.centerRight,
                      child: FilledButton.tonal(
                        onPressed: () => _editPreferences(context),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.edit_outlined, size: 18),
                            const SizedBox(width: 6),
                            Text(t(context, 'profile.editPrefs')),
                          ],
                        ),
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
          const SizedBox(height: 28),

          // ---- Scoped AI Allowance (shopper-managed scopes) ----
          _groupCard(
            context,
            child: ScopesSection(
              api: context.read<ApiService>(),
              lang: Provider.of<LocaleProvider>(context, listen: false)
                  .languageCode,
            ),
          ),
          const SizedBox(height: 28),

          // ---- AI + PayPal efficiency ----
          _sectionHeader(context, t(context, 'profile.sectionGuides')),
          _groupCard(
            context,
            child: Column(
              children: [
                _guideRow(context, Icons.auto_awesome_outlined,
                    t(context, 'profile.guide1')),
                _guideRow(context, Icons.visibility_outlined,
                    t(context, 'profile.guide2')),
                _guideRow(context, Icons.lock_outline,
                    t(context, 'profile.guide3')),
                _guideRow(context, Icons.note_alt_outlined,
                    t(context, 'profile.guide4')),
              ],
            ),
          ),
          const SizedBox(height: 28),

          // ---- Merchant: add PayPal ----
          _sectionHeader(context, t(context, 'profile.sectionMerchant')),
          _merchantCard(context, scheme),
        ],
      ),
    );
  }

  Widget _sectionHeader(BuildContext context, String title) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 0, 4, 10),
      child: Text(
        title,
        style: Theme.of(context).textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: -0.2,
            ),
      ),
    );
  }

  Widget _groupCard(BuildContext context, {required Widget child}) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: scheme.outlineVariant),
        boxShadow: [
          BoxShadow(
            color: scheme.shadow.withValues(alpha: 0.35),
            blurRadius: 16,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: child,
      ),
    );
  }

  Widget _prefRow(
      BuildContext context, IconData icon, String label, List<String> values) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: scheme.onSurfaceVariant),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
              ),
              const SizedBox(height: 2),
              Text(
                values.isEmpty
                    ? '—'
                    : values.join(', '),
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: scheme.onSurfaceVariant,
                      height: 1.3,
                    ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _guideRow(BuildContext context, IconData icon, String text) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: scheme.primaryContainer,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 18, color: scheme.onPrimaryContainer),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              text,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    height: 1.35,
                  ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _merchantCard(BuildContext context, ColorScheme scheme) {
    final lang = Provider.of<LocaleProvider>(context, listen: false).languageCode;
    return _groupCard(
      context,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            t(context, 'profile.merchIntro'),
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: scheme.onSurfaceVariant,
                  height: 1.35,
                ),
          ),
          const SizedBox(height: 14),
          // A small illustrative "café checkout with PayPal" receipt card.
          Container(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
            decoration: BoxDecoration(
              color: scheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Text('☕', style: TextStyle(fontSize: 22)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        lang == 'tr' ? 'Kafe ödemesi' : 'Café checkout',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const Text(
                      '€24.50',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Divider(height: 1, thickness: 1, color: scheme.outlineVariant),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Icon(Icons.check_circle,
                        size: 18, color: scheme.primary),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        lang == 'tr'
                            ? 'PayPal ile onaylandı'
                            : 'Approved with PayPal',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    Icon(Icons.lock_outline,
                        size: 16, color: scheme.onSurfaceVariant),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          _merchPoint(context, Icons.bolt_outlined,
              t(context, 'profile.merch1')),
          _merchPoint(context, Icons.devices_outlined,
              t(context, 'profile.merch2')),
          _merchPoint(context, Icons.verified_user_outlined,
              t(context, 'profile.merch3')),
          _merchPoint(context, Icons.autorenew_outlined,
              t(context, 'profile.merch4')),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: () =>
                  ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text(t(context, 'profile.merchCtaNote'))),
              ),
              icon: const Icon(Icons.add_business_outlined, size: 18),
              label: Text(t(context, 'profile.merchCta')),
            ),
          ),
        ],
      ),
    );
  }

  Widget _merchPoint(BuildContext context, IconData icon, String text) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 17, color: scheme.primary),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    height: 1.3,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}
