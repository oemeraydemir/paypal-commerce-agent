import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:flutter_app/l10n/app_strings.dart';
import 'package:flutter_app/models/cart.dart';
import 'package:flutter_app/models/chat_message.dart';
import 'package:flutter_app/models/order.dart';
import 'package:flutter_app/models/product.dart';
import 'package:flutter_app/models/shopper_preferences.dart';
import 'package:flutter_app/providers/chat_provider.dart';
import 'package:flutter_app/providers/checkout_provider.dart';
import 'package:flutter_app/providers/locale_provider.dart';
import 'package:flutter_app/providers/shopper_profile_provider.dart';
import 'package:flutter_app/services/api_service.dart';
import 'package:flutter_app/services/speech_to_text_voice_recognizer.dart';
import 'package:flutter_app/services/voice_controller.dart';
import 'package:flutter_app/utils/markdown_tables.dart';
import 'package:flutter_app/widgets/evidence_package_section.dart';
import 'package:flutter_app/widgets/paid_receipt_card.dart';
import 'package:flutter_app/widgets/barista_avatar.dart';
import 'package:flutter_app/widgets/assistant_quick_replies.dart';
import 'package:flutter_app/widgets/typing_indicator.dart';

/// Minimal, safe Markdown rendering for assistant chat bubbles (parity with the
/// Web storefront). Only a conservative subset is supported — **bold**, *italic*,
/// `code`, and [links](https://…) — built as TextSpans, never rendered as HTML.
/// Links are styled (underlined, primary color) but not tappable so no gesture
/// recognizer lifecycle is leaked in a Stateless build; the URL is never executed.
class _MarkdownText extends StatelessWidget {
  final String text;
  final TextStyle? style;
  const _MarkdownText(this.text, {this.style});

  static final _bulletRe = RegExp(r'^(\s*)[-*•]\s+', multiLine: true);
  static final _inlineRe = RegExp(r'\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)');

  List<InlineSpan> _spans(String src, Color linkColor) {
    final out = <InlineSpan>[];
    var last = 0;
    for (final m in _inlineRe.allMatches(src)) {
      if (m.start > last) out.add(TextSpan(text: src.substring(last, m.start)));
      if (m.group(1) != null) {
        out.add(TextSpan(text: m.group(1), style: const TextStyle(fontWeight: FontWeight.w700)));
      } else if (m.group(2) != null) {
        out.add(TextSpan(text: m.group(2), style: const TextStyle(fontStyle: FontStyle.italic)));
      } else if (m.group(3) != null) {
        out.add(TextSpan(
          text: m.group(3),
          style: const TextStyle(
            fontFamily: 'monospace',
            fontSize: 12.5,
            backgroundColor: Color(0x14000000),
          ),
        ));
      } else if (m.group(4) != null) {
        final href = (m.group(5) ?? '').trim();
        if (RegExp(r'^https?://', caseSensitive: false).hasMatch(href)) {
          out.add(TextSpan(
            text: m.group(4),
            style: TextStyle(color: linkColor, decoration: TextDecoration.underline),
          ));
        } else {
          out.add(TextSpan(text: m.group(4)));
        }
      }
      last = m.end;
    }
    if (last < src.length) out.add(TextSpan(text: src.substring(last)));
    return out;
  }

  Widget _textBlock(String src, Color linkColor) {
    final normalized = src.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    final withBullets = normalized.replaceAllMapped(_bulletRe, (m) => '${m.group(1)}• ');
    return Text.rich(TextSpan(style: style, children: _spans(withBullets, linkColor)));
  }

  /// A Markdown table drawn as cards: one rounded card per row, first column as
  /// the title, the other columns as label/value pairs (parity with the web).
  Widget _tableCards(BuildContext context, MdBlock block, Color linkColor) {
    final scheme = Theme.of(context).colorScheme;
    final header = block.header!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final cells in block.rows!)
          Container(
            margin: const EdgeInsets.symmetric(vertical: 4),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: scheme.surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: scheme.outlineVariant),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text.rich(
                  TextSpan(
                    style: (style ?? const TextStyle()).copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                    children: _spans(cells.isEmpty ? '' : cells.first, linkColor),
                  ),
                ),
                for (var k = 1; k < cells.length; k++)
                  if (cells[k].isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 3),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            k < header.length ? header[k] : '',
                            style: TextStyle(
                              fontSize: 12,
                              color: scheme.onSurfaceVariant,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Flexible(
                            child: Text.rich(
                              TextSpan(
                                style: style,
                                children: _spans(cells[k], linkColor),
                              ),
                              textAlign: TextAlign.right,
                            ),
                          ),
                        ],
                      ),
                    ),
              ],
            ),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final linkColor = Theme.of(context).colorScheme.primary;
    final blocks = splitMarkdownBlocks(text);
    // No table: exactly the previous single-Text rendering.
    if (!blocks.any((b) => b.isTable)) return _textBlock(text, linkColor);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final b in blocks)
          if (b.isTable)
            _tableCards(context, b, linkColor)
          else
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: _textBlock(b.text!, linkColor),
            ),
      ],
    );
  }
}

/// Main screen: AI chat + product catalog + cart + PayPal checkout.
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  // Voice shopping: converts speech into an editable, user-confirmed text
  // message. Uses the device's on-device recognizer; nothing is sent until the
  // user presses Send (no auto-order / auto-pay).
  final VoiceController _voice = VoiceController(
    recognizer: SpeechToTextVoiceRecognizer(),
  );
  bool _voicePushedFinal = false;

  // Tracks the message list so a newly arrived AI answer is scrolled into view.
  int _lastMessageCount = 0;
  bool _lastLoading = false;

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

    _voice.addListener(_onVoiceChanged);
    unawaited(_voice.probe());

    final appLinks = AppLinks();
    _linkSubscription = appLinks.uriLinkStream.listen(
      _handlePayPalReturn,
      onError: (Object error) {
        if (mounted) {
          context.read<CheckoutProvider>().setError(
                '${t(context, 'error.paypalLink')}: $error',
              );
        }
      },
    );
    _loadInitialLink(appLinks);
    _maybeShowOnboarding();
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
              '${t(context, 'error.paypalLink')}: $error',
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
        SnackBar(content: Text(t(context, 'checkout.mismatch'))),
      );
    }
  }

  Future<void> _clearConversation() async {
    final chat = context.read<ChatProvider>();
    final lang = context.read<LocaleProvider>().languageCode;
    await chat.clearConversation(lang);
    if (mounted && chat.error != null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(chat.error!)));
    }
  }

  void _send([String? quickReply]) {
    if (_voice.isListening || context.read<ChatProvider>().loading) return;
    final text = quickReply ?? _controller.text;
    if (text.trim().isEmpty) return;
    final profile = context.read<ShopperProfileProvider>();
    final lang = context.read<LocaleProvider>().languageCode;
    if (profile.loading) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(t(context, 'profile.loading'))),
      );
      return;
    }
    if (quickReply == null) _controller.clear();
    context.read<ChatProvider>().sendMessage(
          text,
          preferences: profile.preferences,
          lang: lang,
        );
    _voice.onMessageSent();
    _voicePushedFinal = false;
    _scrollToBottom();
  }

  /// Mirrors the voice controller's recognized text into the text field so the
  /// user can review and edit it before sending. While listening, the field
  /// tracks the live transcript; on the final result it is pushed once, after
  /// which the user owns the field (the controller stops overriding it).
  void _onVoiceChanged() {
    if (_voice.state == VoiceState.listening) {
      if (_controller.text != _voice.text) {
        _controller.text = _voice.text;
        _controller.selection = TextSelection.collapsed(
          offset: _controller.text.length,
        );
      }
    } else if (_voice.state == VoiceState.review && !_voicePushedFinal) {
      _controller.text = _voice.text;
      _voicePushedFinal = true;
      _controller.selection = TextSelection.collapsed(
        offset: _controller.text.length,
      );
    }
    if (mounted) setState(() {});
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
              ? t(context, 'profile.saved')
              : profile.error ?? t(context, 'profile.saveError'),
        ),
      ),
    );
  }

  /// Keeps the newest content in view when the conversation changes.
  ///
  /// [_send] scrolls immediately, but the AI answer only arrives seconds later.
  /// On a short viewport (small phone / large font, where the chat area is a
  /// couple of lines tall) that answer landed below the fold, so the shopper
  /// saw their own bubble and an apparently empty reply — a real, observed
  /// defect. Scrolling on every content change fixes it without touching the
  /// send path.
  void _autoScrollOnNewContent(int messageCount, bool loading) {
    final grew = messageCount > _lastMessageCount;
    final loadingChanged = loading != _lastLoading;
    _lastMessageCount = messageCount;
    _lastLoading = loading;
    if (grew || loadingChanged) _scrollToBottom();
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

  void _maybeShowOnboarding() {
    SharedPreferences.getInstance().then((prefs) {
      final seen = prefs.getBool('aicafe.onboarded') ?? false;
      if (!seen && mounted) _showOnboarding();
    });
  }

  void _showOnboarding() {
    final ctx = context;
    showDialog<void>(
      context: ctx,
      builder: (dialogCtx) => AlertDialog(
        title: Row(
          children: [
            const BaristaAvatar(size: 28),
            const SizedBox(width: 8),
            Expanded(child: Text(t(dialogCtx, 'onboarding.title'))),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(t(dialogCtx, 'onboarding.coco')),
              const SizedBox(height: 8),
              Text(t(dialogCtx, 'onboarding.explain')),
              const SizedBox(height: 8),
              Text(t(dialogCtx, 'onboarding.allergy')),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(dialogCtx).pop();
              _markOnboarded();
            },
            child: Text(t(dialogCtx, 'onboarding.gotit')),
          ),
        ],
      ),
    );
  }

  Future<void> _markOnboarded() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool('aicafe.onboarded', true);
    } catch (_) {
      // Best-effort: the welcome help simply shows again next time.
    }
  }

  @override
  void dispose() {
    _linkSubscription.cancel();
    _voice.removeListener(_onVoiceChanged);
    _voice.dispose();
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Subscribe to the locale (listen: true) instead of only reading it.
    //
    // ChatScreen is the Navigator's root route: rebuilding MaterialApp with a
    // new `locale` does NOT rebuild this subtree, because the route keeps the
    // widget it was created with. With `listen: false` the language switch only
    // reached the few subtrees that happened to rebuild for unrelated reasons
    // (a notifying Consumer), which left the AppBar tooltips, the subtitle and
    // the service/profile chips in the previous language — an observed
    // mixed-language screen after switching TR -> EN. Depending on
    // LocaleProvider here re-runs this build (and therefore every `t()` call in
    // the AppBar, chips, welcome panel and input row) on every switch.
    final lang = Provider.of<LocaleProvider>(context).languageCode;
    final timeFormat = AppStrings.timeFormat(lang);

    return Scaffold(
      appBar: AppBar(
        // The toolbar is shared with five action buttons, which leaves only
        // ~139dp for the title on a 411dp-wide phone (Pixel emulator:
        // 1080px / 2.625). The subtitle needs ~190dp on a single line, so the
        // Row overflowed by ~84dp and Flutter painted its yellow/black
        // "OVERFLOWED BY 84 PIXELS" stripe straight across the header — a real
        // visual defect observed on the emulator (render tree: RenderFlex
        // OVERFLOWING, size 139.4 vs child 189.8). The title now adapts: the
        // subtitle is only shown when it fits at the current text scale, and
        // both lines ellipsize as a hard guarantee.
        title: LayoutBuilder(
          builder: (context, constraints) {
            final textScale = MediaQuery.textScalerOf(context).scale(11) / 11;
            final showSubtitle = constraints.maxWidth >= 190 * textScale;
            return Row(
              children: [
                const Icon(Icons.local_cafe_outlined),
                const SizedBox(width: 10),
                Flexible(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'AI Café',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (showSubtitle)
                        Text(
                          t(context, 'app.subtitle'),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.normal,
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.tune),
            tooltip: t(context, 'action.profile'),
            onPressed: _editPreferences,
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: t(context, 'action.clear'),
            onPressed: _clearConversation,
          ),
          IconButton(
            icon: const Icon(Icons.help_outline),
            tooltip: t(context, 'action.help'),
            onPressed: _showOnboarding,
          ),
          Consumer<LocaleProvider>(
            builder: (ctx, loc, _) => IconButton(
              icon: Text(
                loc.languageCode == 'tr' ? 'EN' : 'TR',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              tooltip: t(context, 'lang.switch'),
              onPressed: () =>
                  loc.setLanguage(loc.languageCode == 'tr' ? 'en' : 'tr'),
            ),
          ),
          Consumer<CheckoutProvider>(
            builder: (ctx, checkout, _) => Stack(
              alignment: Alignment.center,
              children: [
                IconButton(
                  icon: const Icon(Icons.shopping_cart_outlined),
                  tooltip: t(context, 'action.cart'),
                  onPressed: _openCartSheet,
                ),
                if (checkout.cart.isNotEmpty)
                  // IgnorePointer: the badge is painted above the IconButton, so
                  // without this it swallowed taps in that corner and the cart
                  // simply did not open (observed on web: clicking the badge
                  // did nothing, clicking 14dp to its left opened the sheet).
                  Positioned(
                    right: 8,
                    top: 8,
                    child: IgnorePointer(
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
              builder: (ctx, chat, _) {
                // The AI answer arrives seconds after [_send] already scrolled,
                // so keep the newest bubble in view whenever content changes.
                _autoScrollOnNewContent(chat.messages.length, chat.loading);
                return ListView.builder(
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
                      return const _AssistantTypingBubble();
                    }
                    final msg = chat.messages[index];
                    return _MessageBubble(
                      msg: msg,
                      timeFormat: timeFormat,
                      onQuickReply: index == chat.messages.length - 1 &&
                              !chat.loading &&
                              !context.watch<ShopperProfileProvider>().loading &&
                              !_voice.isListening
                          ? (reply) {
                              if (chat.messages.isEmpty ||
                                  !identical(chat.messages.last, msg)) {
                                return;
                              }
                              _send(reply);
                            }
                          : null,
                    );
                  },
                );
              },
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
            builder: (ctx, checkout, _) => Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _CheckoutStatus(checkout: checkout),
                if (checkout.receipt != null)
                  ConstrainedBox(
                    constraints: BoxConstraints(
                      maxHeight: MediaQuery.of(ctx).size.height * 0.5,
                    ),
                    child: SingleChildScrollView(
                      child: PaidReceiptCard(
                        receipt: checkout.receipt!,
                        lang: Provider.of<LocaleProvider>(
                          ctx,
                          listen: false,
                        ).languageCode,
                        catalogNames: {
                          for (final p in _catalog) p.id: p.name,
                        },
                        onClose: checkout.dismissReceipt,
                        evidenceSection: EvidencePackageSection(
                          api: checkout.api,
                          orderId: checkout.receipt!.orderId,
                          lang: Provider.of<LocaleProvider>(
                            ctx,
                            listen: false,
                          ).languageCode,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
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
                  Expanded(
                    child: Text(
                      t(context, 'catalog.error'),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  TextButton(
                    onPressed: _retryCatalog,
                    child: Text(t(context, 'catalog.retry')),
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
                            SnackBar(
                              content: Text(
                                t(context, 'catalog.added').replaceAll('%s', p.name),
                              ),
                            ),
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
      builder: (context, chat, _) {
        final voice = _voice;
        final listening = voice.state == VoiceState.listening;
        final canSend = !chat.loading &&
            !context.watch<ShopperProfileProvider>().loading &&
            !listening;
        return SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (voice.available &&
                  (listening ||
                      voice.state == VoiceState.review ||
                      voice.state == VoiceState.error ||
                      voice.state == VoiceState.denied))
                _voiceStatusBanner(voice),
              if (!voice.available)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
                  child: Text(
                    t(context, 'voice.unavailableHint'),
                    style: Theme.of(context).textTheme.bodySmall,
                    textAlign: TextAlign.center,
                  ),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    if (voice.available)
                      IconButton(
                        onPressed: listening ? _voice.stop : _voice.start,
                        tooltip: listening
                            ? t(context, 'voice.stop')
                            : t(context, 'voice.mic'),
                        icon: Icon(listening ? Icons.stop_circle : Icons.mic),
                        color:
                            listening ? Theme.of(context).colorScheme.error : null,
                      ),
                    Expanded(
                      child: TextField(
                        controller: _controller,
                        minLines: 1,
                        maxLines: 4,
                        textInputAction: TextInputAction.send,
                        onSubmitted: (_) => _send(),
                        decoration: InputDecoration(
                          hintText: listening
                              ? t(context, 'voice.listening')
                              : t(context, 'input.hint'),
                          border: const OutlineInputBorder(),
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 12,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filled(
                      onPressed: canSend ? _send : null,
                      tooltip: t(context, 'action.send'),
                      icon: const Icon(Icons.send),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  /// Compact status row for the voice-capture states. Shown only when the mic is
  /// available and there is something to surface (listening / review / error /
  /// denied). Never implies a purchase or auto-action.
  Widget _voiceStatusBanner(VoiceController voice) {
    String label;
    IconData icon;
    Color color;
    final scheme = Theme.of(context).colorScheme;
    switch (voice.state) {
      case VoiceState.listening:
        label = t(context, 'voice.listening');
        icon = Icons.graphic_eq;
        color = scheme.primary;
      case VoiceState.review:
        label = t(context, 'voice.review');
        icon = Icons.edit_note;
        color = scheme.secondary;
      case VoiceState.error:
        // Never surface the engine's raw error token (e.g. `error_no_match`,
        // `error_no_speech`): it is unlocalized, technical and unreadable for
        // a shopper. The localized sentence is shown instead.
        label = t(context, 'voice.error');
        icon = Icons.error_outline;
        color = scheme.error;
      case VoiceState.denied:
        label = t(context, 'voice.permissionDenied');
        icon = Icons.mic_off;
        color = scheme.error;
      case VoiceState.idle:
      case VoiceState.initializing:
      case VoiceState.unavailable:
        return const SizedBox.shrink();
    }
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 4, 16, 0),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              label,
              style: TextStyle(fontSize: 12, color: color),
            ),
          ),
        ],
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
              child: Text(
                t(context, 'service.unavailable'),
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
          // Wrap instead of Row: in Turkish at a 1.3x text scale the two
          // chips need ~209dp + ~200dp, which exceeds the 379dp available and
          // made the Row overflow (render tree: RenderFlex OVERFLOWING).
          // Wrapping puts the second chip on its own line instead.
          return Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: Wrap(
              alignment: WrapAlignment.center,
              spacing: 8,
              runSpacing: 4,
              children: [
                _ServiceStatusChip(
                  label: health.aiEnabled
                      ? t(context, 'service.aiOn')
                      : t(context, 'service.aiOff'),
                  active: health.aiEnabled,
                ),
                _ServiceStatusChip(
                  label: health.paypalEnabled
                      ? t(context, 'service.ppOn')
                      : t(context, 'service.ppOff'),
                  active: health.paypalEnabled,
                ),
              ],
            ),
          );
        },
      );

  Widget _profileStatus() => Consumer<ShopperProfileProvider>(
        builder: (context, profile, _) {
          final lang =
              Provider.of<LocaleProvider>(context, listen: false).languageCode;
          final preferences = profile.preferences;
          final dietaryLabels = preferences.dietary
              .map((value) => ShopperPreferences.dietaryLabel(lang, value))
              .toList()
            ..sort();
          final summary = <String>[
            ...dietaryLabels,
            if (preferences.maxBudgetMinor != null)
              'Budget ≤ ${AppStrings.formatMoney(lang, preferences.maxBudgetMinor!, 'EUR')}',
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
                        ? t(context, 'profile.loading')
                        : profile.error != null
                        ? profile.error!
                        : summary.isEmpty
                        ? t(context, 'profile.empty')
                        : '${t(context, 'profile.summary')}${summary.join(' · ')}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
                TextButton(
                  onPressed: profile.loading ? null : _editPreferences,
                  child: Text(t(context, 'action.edit')),
                ),
              ],
            ),
          );
        },
      );

  void _retryCatalog() {
    final api = context.read<ApiService>();
    setState(() {
      _catalogFuture = _fetchCatalog(api);
      _healthFuture = api.getHealth();
    });
  }
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
                t(context, 'welcome.title'),
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 8),
              Text(
                t(context, 'welcome.body'),
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 18),
              Text(t(context, 'welcome.try'),
                  style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  ActionChip(
                    label: Text(t(context, 'welcome.chip1')),
                    onPressed: () =>
                        onPromptSelected(t(context, 'welcome.prompt1')),
                  ),
                  ActionChip(
                    label: Text(t(context, 'welcome.chip2')),
                    onPressed: () =>
                        onPromptSelected(t(context, 'welcome.prompt2')),
                  ),
                ],
              ),
            ],
          ),
        ),
      );
}

/// Manual "add to cart anyway" offer under an over-budget rule-based reply.
/// Tapping it only puts the lines into the cart; the server policy check and
/// the separate PayPal approval still apply.
class _SuggestionAction extends StatelessWidget {
  final ChatMessage msg;

  const _SuggestionAction({required this.msg});

  @override
  Widget build(BuildContext context) {
    final chat = context.watch<ChatProvider>();
    final lang = context.watch<LocaleProvider>().languageCode;
    final scheme = Theme.of(context).colorScheme;
    final suggestion = msg.suggestion!;
    final added = chat.isSuggestionAdded(msg);

    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            t(context, 'suggest.hint'),
            style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 6),
          if (added)
            Text(
              t(context, 'suggest.added'),
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: scheme.primary,
              ),
            )
          else
            OutlinedButton(
              onPressed: chat.loading || chat.addingSuggestion
                  ? null
                  : () => chat.addSuggestedCart(msg, lang),
              child: Text(
                '${t(context, 'suggest.add')}: ${suggestion.label} (${suggestion.totalFormatted})',
              ),
            ),
        ],
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  final ChatMessage msg;
  final DateFormat timeFormat;
  final ValueChanged<String>? onQuickReply;

  const _MessageBubble({
    required this.msg,
    required this.timeFormat,
    this.onQuickReply,
  });

  @override
  Widget build(BuildContext context) {
    final isUser = msg.isUser;
    final scheme = Theme.of(context).colorScheme;

    final bubble = Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      constraints: BoxConstraints(
        maxWidth: MediaQuery.of(context).size.width * 0.78,
      ),
      decoration: BoxDecoration(
        color: isUser ? scheme.primary : scheme.surfaceContainerHighest,
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
                color: scheme.tertiaryContainer,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                t(context, 'msg.ruleBased'),
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: scheme.onTertiaryContainer,
                ),
              ),
            ),
          ],
          if (msg.providerNote != null) ...[
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(
                msg.providerNote!,
                style: TextStyle(
                  fontSize: 10,
                  fontStyle: FontStyle.italic,
                  color: scheme.onSurfaceVariant,
                ),
              ),
            ),
          ],
          if (isUser)
            Text(
              msg.text,
              style: TextStyle(color: scheme.onPrimary),
            )
          else
            _MarkdownText(
              msg.text,
              style: TextStyle(color: scheme.onSurfaceVariant),
            ),
          if (msg.role == ChatRole.assistant)
            AssistantQuickReplies(
              response: msg.text,
              onSelected: onQuickReply,
            ),
          if (msg.suggestion != null) _SuggestionAction(msg: msg),
          // Server-truthful "Why these items?" note, built only from real
          // prepared-cart data (names/quantities + policy messages verbatim).
          if (msg.cartExplanation != null && !msg.cartExplanation!.isEmpty) ...[
            const SizedBox(height: 8),
            Divider(height: 12, color: scheme.outlineVariant),
            Text(
              t(context, 'why.title'),
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: isUser ? scheme.onPrimary : scheme.onSurface,
              ),
            ),
            const SizedBox(height: 4),
            ...msg.cartExplanation!.itemLines.map(
              (line) => Text(
                '• $line',
                style: TextStyle(
                  fontSize: 12,
                  color: isUser ? scheme.onPrimary : scheme.onSurfaceVariant,
                ),
              ),
            ),
            ...msg.cartExplanation!.policyNotes.map(
              (note) => Padding(
                padding: const EdgeInsets.only(top: 3),
                child: Text(
                  note,
                  style: TextStyle(
                    fontSize: 11,
                    fontStyle: FontStyle.italic,
                    color: isUser ? scheme.onPrimary : scheme.onSurfaceVariant,
                  ),
                ),
              ),
            ),
          ],
          // Honest allergy notice: always present on a cart suggestion, never
          // claims safety (the backend publishes no allergen data).
          if (msg.allergyWarning != null) ...[
            const SizedBox(height: 8),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: scheme.errorContainer.withValues(alpha: 0.6),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: scheme.error.withValues(alpha: 0.4)),
              ),
              child: Text(
                msg.allergyWarning!,
                style: TextStyle(
                  fontSize: 11.5,
                  height: 1.3,
                  color: scheme.onErrorContainer,
                ),
              ),
            ),
          ],
          const SizedBox(height: 4),
          Text(
            timeFormat.format(msg.timestamp),
            style: TextStyle(
              fontSize: 10,
              color: isUser
                  ? scheme.onPrimary.withValues(alpha: 0.7)
                  : scheme.onSurfaceVariant.withValues(alpha: 0.6),
            ),
          ),
        ],
      ),
    );

    if (isUser) {
      return Align(alignment: Alignment.centerRight, child: bubble);
    }

    // Assistant messages get the Coco barista avatar on the left.
    return Align(
      alignment: Alignment.centerLeft,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          const Padding(
            padding: EdgeInsets.only(top: 8, right: 8),
            child: BaristaAvatar(size: 34),
          ),
          Flexible(child: bubble),
        ],
      ),
    );
  }
}

/// Shown while the backend is generating a reply: the Coco avatar with an
/// animated "typing…" indicator (replaces the old single spinner).
class _AssistantTypingBubble extends StatelessWidget {
  const _AssistantTypingBubble();

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const BaristaAvatar(size: 34),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(14),
              ),
              child: const TypingIndicator(),
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
  Widget build(BuildContext context) {
    final lang = Provider.of<LocaleProvider>(context).languageCode;
    return Consumer<CheckoutProvider>(
      builder: (context, checkout, _) {
        final products = {for (final product in catalog) product.id: product};
        final entries = checkout.cart.entries.toList();
        final totalMinor = entries.fold<int>(
          0,
          (total, entry) =>
              total + (products[entry.key]?.priceMinor ?? 0) * entry.value,
        );
        final totalFormatted = AppStrings.formatMoney(
          lang,
          totalMinor,
          catalog.isEmpty ? cart.currency : catalog.first.currency,
        );

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
                      ? t(context, 'cart.ruleBased')
                      : t(context, 'cart.aiPrepared'),
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                const SizedBox(height: 6),
                ...entries.map((entry) {
                  final product = products[entry.key];
                  final name = product?.name ?? entry.key;
                  final unitPrice =
                      product?.priceFormatted ?? t(context, 'cart.priceAtCheckout');
                  return Text(
                    '${entry.value}× $name · $unitPrice',
                    style: Theme.of(context).textTheme.bodyMedium,
                  );
                }),
                const Divider(),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('${t(context, 'cart.subtotal')}$totalFormatted'),
                    FilledButton.icon(
                      icon: const Icon(Icons.payment),
                      label: Text(t(context, 'cart.reviewPay')),
                      onPressed: checkout.busy ||
                              checkout.hasPendingOrder ||
                              !checkout.policyAllowsCheckout
                          ? null
                          : checkout.startCheckout,
                    ),
                  ],
                ),
                Text(
                  t(context, 'cart.serverConfirm'),
                  style: const TextStyle(fontSize: 11),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
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
                label: Text(t(context, 'checkout.openPayPal')),
                onPressed: checkout.busy
                    ? null
                    : () => checkout.reopenApprovalPage(),
              ),
              TextButton(
                onPressed: checkout.busy
                    ? null
                    : () => checkout.confirmApprovalInBrowser(),
                child: Text(t(context, 'checkout.returnNotReceived')),
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
                  ? t(context, 'checkout.checkStatus')
                  : t(context, 'checkout.confirmCapture'),
            ),
            onPressed:
                checkout.busy ? null : () => checkout.completeCheckout(),
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
    // Listen (not just read) so an open cart sheet re-localises if the shopper
    // flips the language while it is on screen.
    final lang = Provider.of<LocaleProvider>(context).languageCode;
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
              Text(t(context, 'cart.title'),
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              if (entries.isEmpty)
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(t(context, 'cart.empty')),
                )
              else
                ...entries.map((entry) {
                  final product = productOf(entry.key);
                  return ListTile(
                    title: Text(product.name),
                    subtitle: Text(
                      t(context, 'cart.qty').replaceAll('%s', '${entry.value}'),
                    ),
                    leading: Text(
                      '${product.priceFormatted} × ${entry.value}',
                      style: Theme.of(context).textTheme.labelLarge,
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          tooltip:
                              'Remove one ${product.name}',
                          icon: const Icon(Icons.remove_circle_outline),
                          onPressed: () => checkout.setQuantity(
                            entry.key,
                            entry.value - 1,
                          ),
                        ),
                        IconButton(
                          tooltip: 'Add one ${product.name}',
                          icon: const Icon(Icons.add_circle_outline),
                          onPressed: () => checkout.setQuantity(
                            entry.key,
                            entry.value + 1,
                          ),
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
                    '${t(context, 'cart.subtotal')}${_cartTotal(entries, productOf, lang)}',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  t(context, 'cart.serverConfirm'),
                  style: const TextStyle(fontSize: 12),
                ),
                const SizedBox(height: 4),
                Text(
                  _policyLine(ctx, checkout),
                  key: const Key('cart-policy-status'),
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (checkout.allowance != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    _allowanceLine(
                      ctx,
                      checkout,
                      lang,
                      catalog.isEmpty ? 'EUR' : catalog.first.currency,
                    ),
                    key: const Key('cart-allowance-status'),
                    style: const TextStyle(fontSize: 12),
                  ),
                ],
              ],
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: checkout.busy || checkout.hasPendingOrder
                          ? null
                          : checkout.clear,
                      child: Text(t(context, 'action.clear')),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton.icon(
                      icon: const Icon(Icons.payment),
                      label: Text(t(context, 'cart.checkout')),
                      onPressed: (checkout.busy ||
                              checkout.hasPendingOrder ||
                              !checkout.policyAllowsCheckout)
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

  String _policyLine(BuildContext context, CheckoutProvider c) {
    switch (c.policyStatus) {
      case CartPolicyStatus.checking:
        return t(context, 'policy.checking');
      case CartPolicyStatus.allowed:
        return t(context, 'policy.allowed');
      case CartPolicyStatus.needsApproval:
        return t(context, 'policy.needsApproval');
      case CartPolicyStatus.blocked:
        return t(context, 'policy.blocked')
            .replaceAll('%s', c.policyReason ?? t(context, 'policy.error'));
      case CartPolicyStatus.error:
        return c.policyReason ?? t(context, 'policy.error');
      case CartPolicyStatus.idle:
        return '';
    }
  }

  String _allowanceLine(
    BuildContext context,
    CheckoutProvider c,
    String lang,
    String currency,
  ) {
    final a = c.allowance;
    if (a == null) return '';
    final remaining = AppStrings.formatMoney(lang, a.remainingTodayMinor, currency);
    final daily = AppStrings.formatMoney(lang, a.dailySpendLimitMinor, currency);
    final perPurchase = AppStrings.formatMoney(lang, a.maxPerPurchaseMinor, currency);
    final parts = <String>[
      t(context, 'policy.allowanceRemaining').replaceAll('%s', '$remaining / $daily'),
      t(context, 'policy.allowancePerPurchase').replaceAll('%s', perPurchase),
    ];
    if (!a.enabled) {
      parts.add(t(context, 'policy.allowanceDisabled'));
    } else if (a.validUntil != null) {
      parts.add(t(context, 'policy.allowanceExpires').replaceAll('%s', a.validUntil!));
    }
    return parts.join(' · ');
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
    String lang,
  ) {
    final totalMinor = entries.fold<int>(
      0,
      (total, entry) => total + productOf(entry.key).priceMinor * entry.value,
    );
    return AppStrings.formatMoney(
      lang,
      totalMinor,
      catalog.isEmpty ? 'EUR' : catalog.first.currency,
    );
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

  @override
  Widget build(BuildContext context) {
    // Listen (not just read) so the dialog re-localises on a language switch.
    final lang = Provider.of<LocaleProvider>(context).languageCode;
    return AlertDialog(
      title: Text(t(context, 'profile.dialogTitle')),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              t(context, 'profile.dietary'),
              style: Theme.of(context).textTheme.titleSmall,
            ),
            ...ShopperPreferences.dietaryOptions.keys.map(
              (key) => CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(ShopperPreferences.dietaryLabel(lang, key)),
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
            ),
            const SizedBox(height: 8),
            Text(
              t(context, 'profile.allergenTitle'),
              style: Theme.of(context).textTheme.titleSmall,
            ),
            ...ShopperPreferences.allergenOptions.keys.map(
              (key) => CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
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
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _budgetController,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(
                labelText: t(context, 'profile.budgetLabel'),
                hintText: t(context, 'profile.budgetHint'),
                prefixText: '€ ',
                border: const OutlineInputBorder(),
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
              t(context, 'profile.disclaimer'),
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(t(context, 'action.cancel')),
        ),
        FilledButton(
          onPressed: _save,
          child: Text(t(context, 'action.saveProfile')),
        ),
      ],
    );
  }
}
