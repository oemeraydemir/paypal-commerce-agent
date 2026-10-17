import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import 'package:flutter_app/models/cart.dart';
import 'package:flutter_app/models/chat_message.dart';
import 'package:flutter_app/models/order.dart';
import 'package:flutter_app/models/product.dart';
import 'package:flutter_app/models/shopper_preferences.dart';
import 'package:flutter_app/providers/chat_provider.dart';
import 'package:flutter_app/providers/checkout_provider.dart';
import 'package:flutter_app/providers/shopper_profile_provider.dart';
import 'package:flutter_app/services/api_service.dart';

/// Main screen: AI chat + product catalog + cart + PayPal checkout.
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final DateFormat _timeFormat = DateFormat('HH:mm');

  late Future<List<Product>> _catalogFuture;
  late Future<HealthStatus> _healthFuture;
  late final StreamSubscription<Uri> _linkSubscription;
  List<Product> _catalog = <Product>[];

  @override
  void initState() {
    super.initState();
    final api = context.read<ApiService>();
    _catalogFuture = _fetchCatalog(api);
    _healthFuture = api.getHealth();

    final appLinks = AppLinks();
    _linkSubscription = appLinks.uriLinkStream.listen(
      _handlePayPalReturn,
      onError: (Object error) {
        if (mounted) {
          context.read<CheckoutProvider>().setError(
            'Could not read the PayPal return link: $error',
          );
        }
      },
    );
    _loadInitialLink(appLinks);
  }

  Future<List<Product>> _fetchCatalog(ApiService api) async {
    final products = await api.getCatalog();
    _catalog = products;
    return products;
  }

  Future<void> _loadInitialLink(AppLinks appLinks) async {
    try {
      final initialLink = await appLinks.getInitialLink();
      if (initialLink != null) _handlePayPalReturn(initialLink);
    } catch (error) {
      if (mounted) {
        context.read<CheckoutProvider>().setError(
          'Could not read the PayPal return link: $error',
        );
      }
    }
  }

  Future<void> _handlePayPalReturn(Uri uri) async {
    if (uri.scheme != 'paypalcommerceagent') return;
    final handled = await context.read<CheckoutProvider>().handlePayPalReturn(
      uri,
    );
    if (!handled && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'This PayPal return link does not match your pending order.',
          ),
        ),
      );
    }
  }

  Future<void> _clearConversation() async {
    final chat = context.read<ChatProvider>();
    await chat.clearConversation();
    if (mounted && chat.error != null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(chat.error!)));
    }
  }

  void _retryCatalog() {
    final api = context.read<ApiService>();
    setState(() {
      _catalogFuture = _fetchCatalog(api);
      _healthFuture = api.getHealth();
    });
  }

  @override
  void dispose() {
    _linkSubscription.cancel();
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _send() {
    final text = _controller.text;
    if (text.trim().isEmpty) return;
    final profile = context.read<ShopperProfileProvider>();
    if (profile.loading) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Loading your shopping profile…')),
      );
      return;
    }
    _controller.clear();
    context.read<ChatProvider>().sendMessage(
      text,
      preferences: profile.preferences,
    );
    _scrollToBottom();
  }

  Future<void> _editPreferences() async {
    final profile = context.read<ShopperProfileProvider>();
    final preferences = await showDialog<ShopperPreferences>(
      context: context,
      builder: (_) =>
          _ShopperPreferencesDialog(initialPreferences: profile.preferences),
    );
    if (preferences == null || !mounted) return;

    final saved = await profile.save(preferences);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          saved
              ? 'Shopping profile saved on this device.'
              : profile.error ?? 'Could not save shopping profile.',
        ),
      ),
    );
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _openCartSheet() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => _CartSheet(catalog: _catalog),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.local_cafe_outlined),
            SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('AI Café'),
                Text(
                  'AI-powered shopping · PayPal sandbox',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.normal),
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.tune),
            tooltip: 'Shopping profile',
            onPressed: _editPreferences,
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Clear conversation',
            onPressed: _clearConversation,
          ),
          Consumer<CheckoutProvider>(
            builder: (ctx, checkout, _) => Stack(
              alignment: Alignment.center,
              children: [
                IconButton(
                  icon: const Icon(Icons.shopping_cart_outlined),
                  tooltip: 'Cart',
                  onPressed: _openCartSheet,
                ),
                if (checkout.cart.isNotEmpty)
                  Positioned(
                    right: 8,
                    top: 8,
                    child: Container(
                      padding: const EdgeInsets.all(2),
                      decoration: const BoxDecoration(
                        color: Colors.red,
                        shape: BoxShape.circle,
                      ),
                      constraints: const BoxConstraints(
                        minWidth: 16,
                        minHeight: 16,
                      ),
                      child: Text(
                        '${checkout.cart.values.fold<int>(0, (total, quantity) => total + quantity)}',
                        style: const TextStyle(
                          fontSize: 10,
                          color: Colors.white,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          _serviceStatus(),
          _profileStatus(),
          _catalogChips(),
          Expanded(
            child: Consumer<ChatProvider>(
              builder: (ctx, chat, _) => ListView.builder(
                controller: _scrollController,
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                itemCount: chat.messages.isEmpty
                    ? 1 + (chat.loading ? 1 : 0)
                    : chat.messages.length + (chat.loading ? 1 : 0),
                itemBuilder: (context, index) {
                  if (chat.messages.isEmpty && index == 0) {
                    return _WelcomePanel(
                      onPromptSelected: (prompt) {
                        _controller.text = prompt;
                        _send();
                      },
                    );
                  }
                  if (chat.loading && index == chat.messages.length) {
                    return const Align(
                      alignment: Alignment.centerLeft,
                      child: Padding(
                        padding: EdgeInsets.symmetric(vertical: 8),
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    );
                  }
                  final msg = chat.messages[index];
                  return _MessageBubble(msg: msg, timeFormat: _timeFormat);
                },
              ),
            ),
          ),
          Consumer<ChatProvider>(
            builder: (ctx, chat, _) =>
                chat.checkoutReady && chat.lastPreparedCart != null
                ? _PreparedCartCard(
                    cart: chat.lastPreparedCart!,
                    catalog: _catalog,
                    mode: chat.lastPreparedCartMode,
                  )
                : const SizedBox.shrink(),
          ),
          Consumer<CheckoutProvider>(
            builder: (ctx, checkout, _) => _CheckoutStatus(checkout: checkout),
          ),
          _inputRow(),
        ],
      ),
    );
  }

  Widget _catalogChips() {
    return FutureBuilder<List<Product>>(
      future: _catalogFuture,
      builder: (context, snap) {
        if (snap.hasError) {
          return SizedBox(
            height: 56,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Could not load the café menu. Check the backend connection.',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  TextButton(
                    onPressed: _retryCatalog,
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          );
        }
        if (!snap.hasData) {
          return const SizedBox(
            height: 56,
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          );
        }
        final products = snap.data!;
        return SizedBox(
          height: 56,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            itemCount: products.length,
            separatorBuilder: (context, index) => const SizedBox(width: 8),
            itemBuilder: (context, i) {
              final p = products[i];
              return Consumer<CheckoutProvider>(
                builder: (ctx, checkout, _) => ActionChip(
                  avatar: const Icon(Icons.add_shopping_cart, size: 16),
                  label: Text('${p.name} · ${p.priceFormatted}'),
                  onPressed: !p.available
                      ? null
                      : () {
                          checkout.addProduct(p.id);
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Added ${p.name} to cart')),
                          );
                        },
                ),
              );
            },
          ),
        );
      },
    );
  }

  Widget _inputRow() {
    return Consumer<ChatProvider>(
      builder: (context, chat, _) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: TextField(
                  controller: _controller,
                  minLines: 1,
                  maxLines: 4,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _send(),
                  decoration: const InputDecoration(
                    hintText:
                        'What would you like? Add a budget or dietary need.',
                    border: OutlineInputBorder(),
                    contentPadding: EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 12,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                onPressed:
                    chat.loading ||
                        context.watch<ShopperProfileProvider>().loading
                    ? null
                    : _send,
                tooltip: 'Send shopping request',
                icon: const Icon(Icons.send),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _serviceStatus() => FutureBuilder<HealthStatus>(
    future: _healthFuture,
    builder: (context, snapshot) {
      if (snapshot.hasError) {
        return Container(
          width: double.infinity,
          color: Theme.of(context).colorScheme.errorContainer,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: const Text(
            'Backend unavailable — start the API and retry the menu.',
            textAlign: TextAlign.center,
          ),
        );
      }
      if (!snapshot.hasData) {
        return const SizedBox(
          height: 40,
          child: Center(child: LinearProgressIndicator()),
        );
      }

      final health = snapshot.data!;
      return Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _ServiceStatusChip(
              label: health.aiEnabled ? 'AI configured' : 'AI not configured',
              active: health.aiEnabled,
            ),
            const SizedBox(width: 8),
            _ServiceStatusChip(
              label: health.paypalEnabled
                  ? 'PayPal sandbox configured'
                  : 'PayPal not configured',
              active: health.paypalEnabled,
            ),
          ],
        ),
      );
    },
  );

  Widget _profileStatus() => Consumer<ShopperProfileProvider>(
    builder: (context, profile, _) {
      final preferences = profile.preferences;
      final dietaryLabels =
          preferences.dietary
              .map((value) => ShopperPreferences.dietaryOptions[value]!)
              .toList()
            ..sort();
      final summary = <String>[
        ...dietaryLabels,
        if (preferences.maxBudgetMinor != null)
          'Budget ≤ €${(preferences.maxBudgetMinor! / 100).toStringAsFixed(2)}',
      ];

      return Padding(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 4),
        child: Row(
          children: [
            const Icon(Icons.person_outline, size: 18),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                profile.loading
                    ? 'Loading shopping profile…'
                    : profile.error != null
                    ? profile.error!
                    : summary.isEmpty
                    ? 'Personalize AI suggestions with your preferences'
                    : 'AI profile: ${summary.join(' · ')}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
            TextButton(
              onPressed: profile.loading ? null : _editPreferences,
              child: const Text('Edit'),
            ),
          ],
        ),
      );
    },
  );
}

class _ServiceStatusChip extends StatelessWidget {
  final String label;
  final bool active;

  const _ServiceStatusChip({required this.label, required this.active});

  @override
  Widget build(BuildContext context) => Chip(
    visualDensity: VisualDensity.compact,
    avatar: Icon(
      active ? Icons.check_circle_outline : Icons.info_outline,
      size: 16,
    ),
    label: Text(label, style: const TextStyle(fontSize: 11)),
    backgroundColor: active
        ? Theme.of(context).colorScheme.secondaryContainer
        : Theme.of(context).colorScheme.surfaceContainerHighest,
    side: BorderSide.none,
  );
}

class _WelcomePanel extends StatelessWidget {
  final ValueChanged<String> onPromptSelected;

  const _WelcomePanel({required this.onPromptSelected});

  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.only(top: 20),
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.auto_awesome,
            size: 32,
            color: Theme.of(context).colorScheme.primary,
          ),
          const SizedBox(height: 12),
          Text(
            'A smarter way to order',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 8),
          Text(
            'Tell the AI what you need. It finds café items and prepares a '
            'priced cart for you to review. You stay in control: payment only '
            'happens after you approve it in PayPal sandbox.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 18),
          Text('Try a request', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: [
              ActionChip(
                label: const Text('Vegetarian breakfast under €20'),
                onPressed: () => onPromptSelected(
                  'Plan a vegetarian breakfast for two under €20.',
                ),
              ),
              ActionChip(
                label: const Text('A coffee and a treat'),
                onPressed: () =>
                    onPromptSelected('Find me a coffee and a sweet treat.'),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}

class _MessageBubble extends StatelessWidget {
  final ChatMessage msg;
  final DateFormat timeFormat;

  const _MessageBubble({required this.msg, required this.timeFormat});

  @override
  Widget build(BuildContext context) {
    final isUser = msg.isUser;
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.78,
        ),
        decoration: BoxDecoration(
          color: isUser
              ? Theme.of(context).colorScheme.primary
              : Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Truthful label for the deterministic fallback: the backend's
            // `mode` is "rule-based", so this reply is explicitly not AI.
            if (msg.isRuleBased) ...[
              Container(
                margin: const EdgeInsets.only(bottom: 6),
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.tertiaryContainer,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  'Rule-based answer · no AI',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: Theme.of(context).colorScheme.onTertiaryContainer,
                  ),
                ),
              ),
            ],
            Text(
              msg.text,
              style: TextStyle(
                color: isUser
                    ? Theme.of(context).colorScheme.onPrimary
                    : Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              timeFormat.format(msg.timestamp),
              style: TextStyle(
                fontSize: 10,
                color: isUser
                    ? Theme.of(context).colorScheme.onPrimary
                          .withValues(alpha: 0.7)
                    : Theme.of(context).colorScheme.onSurfaceVariant
                          .withValues(alpha: 0.6),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PreparedCartCard extends StatelessWidget {
  final PreparedCart cart;
  final List<Product> catalog;

  /// Backend mode of the reply that produced this cart (`ai` / `rule-based`).
  final ChatMode? mode;

  const _PreparedCartCard({
    required this.cart,
    required this.catalog,
    this.mode,
  });

  @override
  Widget build(BuildContext context) => Consumer<CheckoutProvider>(
    builder: (context, checkout, _) {
      final products = {for (final product in catalog) product.id: product};
      final entries = checkout.cart.entries.toList();
      final totalMinor = entries.fold<int>(
        0,
        (total, entry) =>
            total + (products[entry.key]?.priceMinor ?? 0) * entry.value,
      );
      final totalFormatted = NumberFormat.simpleCurrency(
        locale: 'de_DE',
        name: catalog.isEmpty ? cart.currency : catalog.first.currency,
      ).format(totalMinor / 100);

      return Card(
        margin: const EdgeInsets.fromLTRB(12, 4, 12, 4),
        color: Theme.of(context).colorScheme.primaryContainer,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                mode == ChatMode.ruleBased
                    ? 'Rule-based cart (no AI) · your edits'
                    : 'AI-prepared cart · your edits',
                style: Theme.of(context).textTheme.titleSmall,
              ),
              const SizedBox(height: 6),
              ...entries.map((entry) {
                final product = products[entry.key];
                final name = product?.name ?? entry.key;
                final unitPrice =
                    product?.priceFormatted ?? 'Price at checkout';
                return Text(
                  '${entry.value}× $name · $unitPrice',
                  style: Theme.of(context).textTheme.bodyMedium,
                );
              }),
              const Divider(),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Subtotal: $totalFormatted'),
                  FilledButton.icon(
                    icon: const Icon(Icons.payment),
                    label: const Text('Review & pay'),
                    onPressed:
                        checkout.busy ||
                            checkout.hasPendingOrder ||
                            !checkout.canCheckout
                        ? null
                        : checkout.startCheckout,
                  ),
                ],
              ),
              const Text(
                'The server confirms final prices before PayPal checkout.',
                style: TextStyle(fontSize: 11),
              ),
            ],
          ),
        ),
      );
    },
  );
}

class _CheckoutStatus extends StatelessWidget {
  final CheckoutProvider checkout;

  const _CheckoutStatus({required this.checkout});

  @override
  Widget build(BuildContext context) {
    final widgets = <Widget>[];

    if (checkout.error != null) {
      widgets.add(
        Container(
          width: double.infinity,
          color: Theme.of(context).colorScheme.errorContainer,
          padding: const EdgeInsets.all(10),
          child: Text(
            checkout.error!,
            style: TextStyle(
              color: Theme.of(context).colorScheme.onErrorContainer,
            ),
          ),
        ),
      );
    } else if (checkout.statusMessage != null) {
      widgets.add(
        Container(
          width: double.infinity,
          color: Theme.of(context).colorScheme.secondaryContainer,
          padding: const EdgeInsets.all(10),
          child: Text(
            checkout.statusMessage!,
            style: TextStyle(
              color: Theme.of(context).colorScheme.onSecondaryContainer,
            ),
          ),
        ),
      );
    }

    if (checkout.created != null &&
        checkout.captured == null &&
        !checkout.paypalApproved) {
      widgets.add(
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          child: Wrap(
            alignment: WrapAlignment.center,
            spacing: 8,
            children: [
              OutlinedButton.icon(
                icon: const Icon(Icons.open_in_browser),
                label: const Text('Open PayPal'),
                onPressed: checkout.busy
                    ? null
                    : () => checkout.reopenApprovalPage(),
              ),
              TextButton(
                onPressed: checkout.busy
                    ? null
                    : () => checkout.confirmApprovalInBrowser(),
                child: const Text('Approval return not received?'),
              ),
            ],
          ),
        ),
      );
    }

    if (checkout.created != null &&
        checkout.captured == null &&
        checkout.paypalApproved) {
      widgets.add(
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          child: FilledButton.icon(
            icon: const Icon(Icons.check_circle),
            label: Text(
              checkout.statusMessage?.contains('not confirmed') == true
                  ? 'Check payment status'
                  : 'Confirm & capture payment',
            ),
            onPressed: checkout.busy ? null : () => checkout.completeCheckout(),
          ),
        ),
      );
    }

    if (widgets.isEmpty) return const SizedBox.shrink();
    return Column(children: widgets);
  }
}

/// Bottom sheet for the manual cart.
class _CartSheet extends StatelessWidget {
  final List<Product> catalog;

  const _CartSheet({required this.catalog});

  @override
  Widget build(BuildContext context) {
    Product productOf(String id) =>
        catalog.firstWhere((p) => p.id == id, orElse: () => _placeholder(id));

    return Consumer<CheckoutProvider>(
      builder: (ctx, checkout, _) {
        final entries = checkout.cart.entries.toList();
        return Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(context).viewInsets.bottom,
            top: 16,
            left: 16,
            right: 16,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Your cart', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              if (entries.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(16),
                  child: Text(
                    'Cart is empty. Tap a product chip to add items.',
                  ),
                )
              else
                ...entries.map((entry) {
                  final product = productOf(entry.key);
                  return ListTile(
                    title: Text(product.name),
                    subtitle: Text('qty ${entry.value}'),
                    leading: Text(
                      '${product.priceFormatted} × ${entry.value}',
                      style: Theme.of(context).textTheme.labelLarge,
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          tooltip: 'Remove one ${product.name}',
                          icon: const Icon(Icons.remove_circle_outline),
                          onPressed: () =>
                              checkout.setQuantity(entry.key, entry.value - 1),
                        ),
                        IconButton(
                          tooltip: 'Add one ${product.name}',
                          icon: const Icon(Icons.add_circle_outline),
                          onPressed: () =>
                              checkout.setQuantity(entry.key, entry.value + 1),
                        ),
                      ],
                    ),
                  );
                }),
              if (entries.isNotEmpty) ...[
                const Divider(),
                Align(
                  alignment: Alignment.centerRight,
                  child: Text(
                    'Subtotal: ${_cartTotal(entries, productOf)}',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'The server confirms final prices before PayPal checkout.',
                  style: TextStyle(fontSize: 12),
                ),
              ],
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: checkout.busy || checkout.hasPendingOrder
                          ? null
                          : checkout.clear,
                      child: const Text('Clear'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton.icon(
                      icon: const Icon(Icons.payment),
                      label: const Text('Checkout with PayPal'),
                      onPressed:
                          (checkout.busy ||
                              checkout.hasPendingOrder ||
                              !checkout.canCheckout)
                          ? null
                          : () {
                              Navigator.of(ctx).pop();
                              checkout.startCheckout();
                            },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
            ],
          ),
        );
      },
    );
  }

  Product _placeholder(String id) => Product(
    id: id,
    name: id,
    description: '',
    priceMinor: 0,
    currency: 'EUR',
    category: '',
    tags: const [],
    dietary: const [],
    occasion: const [],
    available: true,
  );

  String _cartTotal(
    List<MapEntry<String, int>> entries,
    Product Function(String id) productOf,
  ) {
    final totalMinor = entries.fold<int>(
      0,
      (total, entry) => total + productOf(entry.key).priceMinor * entry.value,
    );
    return NumberFormat.simpleCurrency(
      locale: 'de_DE',
      name: catalog.isEmpty ? 'EUR' : catalog.first.currency,
    ).format(totalMinor / 100);
  }
}

class _ShopperPreferencesDialog extends StatefulWidget {
  final ShopperPreferences initialPreferences;

  const _ShopperPreferencesDialog({required this.initialPreferences});

  @override
  State<_ShopperPreferencesDialog> createState() =>
      _ShopperPreferencesDialogState();
}

class _ShopperPreferencesDialogState extends State<_ShopperPreferencesDialog> {
  late final TextEditingController _budgetController;
  late final Set<String> _dietary;
  String? _validationError;

  @override
  void initState() {
    super.initState();
    _dietary = {...widget.initialPreferences.dietary};
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
          _validationError = 'Enter a budget between €1 and €100.';
        });
        return;
      }
      budgetMinor = (amount * 100).round();
    }
    Navigator.of(
      context,
    ).pop(ShopperPreferences(dietary: _dietary, maxBudgetMinor: budgetMinor));
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Shopping profile'),
    content: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Dietary preferences',
            style: Theme.of(context).textTheme.titleSmall,
          ),
          ...ShopperPreferences.dietaryOptions.entries.map(
            (option) => CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(option.value),
              value: _dietary.contains(option.key),
              onChanged: (selected) {
                setState(() {
                  if (selected ?? false) {
                    _dietary.add(option.key);
                  } else {
                    _dietary.remove(option.key);
                  }
                });
              },
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _budgetController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
              labelText: 'Maximum cart budget (EUR)',
              hintText: 'No limit',
              prefixText: '€ ',
              border: OutlineInputBorder(),
            ),
          ),
          if (_validationError != null) ...[
            const SizedBox(height: 8),
            Text(
              _validationError!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
          const SizedBox(height: 12),
          Text(
            'Saved on this device and shared with the AI when you send a '
            'shopping request. Product dietary labels are not an allergen '
            'or cross-contamination guarantee.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.of(context).pop(),
        child: const Text('Cancel'),
      ),
      FilledButton(onPressed: _save, child: const Text('Save profile')),
    ],
  );
}
