import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'package:flutter_app/l10n/app_strings.dart';
import 'package:flutter_app/models/shopper_preferences.dart';
import 'package:flutter_app/providers/locale_provider.dart';

/// A dedicated, grouped settings screen for the shopper's dietary + allergen
/// preferences and optional budget cap. Replaces the old alert dialog with an
/// organized full-height settings surface while keeping the exact same saved
/// payload ([ShopperPreferences]) and budget validation.
class ProfileSettingsScreen extends StatefulWidget {
  final ShopperPreferences initialPreferences;

  const ProfileSettingsScreen({super.key, required this.initialPreferences});

  @override
  State<ProfileSettingsScreen> createState() => _ProfileSettingsScreenState();
}

class _ProfileSettingsScreenState extends State<ProfileSettingsScreen> {
  late final TextEditingController _budgetController;
  late final Set<String> _dietary;
  late final Set<String> _allergens;
  String? _validationError;

  @override
  void initState() {
    super.initState();
    _dietary = {...widget.initialPreferences.dietary};
    _allergens = {...widget.initialPreferences.allergens};
    final budget = widget.initialPreferences.maxBudgetMinor;
    _budgetController = TextEditingController(
      text: budget == null ? '' : (budget / 100).toStringAsFixed(2),
    );
  }

  @override
  void dispose() {
    _budgetController.dispose();
    super.dispose();
  }

  void _save() {
    final value = _budgetController.text.trim().replaceAll(',', '.');
    int? budgetMinor;
    if (value.isNotEmpty) {
      final amount = double.tryParse(value);
      if (amount == null || amount < 1 || amount > 100) {
        setState(() {
          _validationError = t(context, 'profile.budgetError');
        });
        return;
      }
      budgetMinor = (amount * 100).round();
    }
    Navigator.of(context).pop(
      ShopperPreferences(
        dietary: _dietary,
        allergens: _allergens,
        maxBudgetMinor: budgetMinor,
      ),
    );
  }

  Widget _sectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.2,
                  ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final lang = Provider.of<LocaleProvider>(context).languageCode;
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: Text(t(context, 'profile.dialogTitle')),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: FilledButton(
              onPressed: _save,
              child: Text(t(context, 'action.saveProfile')),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: [
          // Dietary preferences group
          _sectionHeader(t(context, 'profile.dietary')),
          _groupCard(
            children: [
              for (final key in ShopperPreferences.dietaryOptions.keys)
                CheckboxListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 8),
                  controlAffinity: ListTileControlAffinity.leading,
                  activeColor: scheme.primary,
                  title: Text(
                    ShopperPreferences.dietaryLabel(lang, key),
                    style: const TextStyle(fontWeight: FontWeight.w500),
                  ),
                  value: _dietary.contains(key),
                  onChanged: (selected) {
                    setState(() {
                      if (selected ?? false) {
                        _dietary.add(key);
                      } else {
                        _dietary.remove(key);
                      }
                    });
                  },
                ),
            ],
          ),
          const SizedBox(height: 24),

          // Allergen concerns group
          _sectionHeader(t(context, 'profile.allergenTitle')),
          _groupCard(
            children: [
              for (final key in ShopperPreferences.allergenOptions.keys)
                CheckboxListTile(
                  dense: true,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 8),
                  controlAffinity: ListTileControlAffinity.leading,
                  activeColor: scheme.primary,
                  title: Text(ShopperPreferences.allergenLabel(lang, key)),
                  value: _allergens.contains(key),
                  onChanged: (selected) {
                    setState(() {
                      if (selected ?? false) {
                        _allergens.add(key);
                      } else {
                        _allergens.remove(key);
                      }
                    });
                  },
                ),
            ],
          ),
          const SizedBox(height: 24),

          // Budget group
          _sectionHeader(t(context, 'profile.budgetLabel')),
          _groupCard(
            children: [
              TextField(
                controller: _budgetController,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(
                  labelText: t(context, 'profile.budgetLabel'),
                  hintText: t(context, 'profile.budgetHint'),
                  prefixText: '€ ',
                  border: const OutlineInputBorder(),
                  errorText: _validationError,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                t(context, 'profile.disclaimer'),
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: scheme.onSurfaceVariant,
                      height: 1.4,
                    ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _groupCard({required List<Widget> children}) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: scheme.outlineVariant),
        boxShadow: [
          BoxShadow(
            color: scheme.shadow.withValues(alpha: 0.4),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      // A transparent Material inside the decorated box gives the CheckboxListTile a
      // Material ancestor to paint its background / ink splash onto (otherwise the
      // Container's BoxDecoration hides them — a Flutter framework assertion).
      child: Material(
        color: Colors.transparent,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: children,
        ),
      ),
    );
  }
}
