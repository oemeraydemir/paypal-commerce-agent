import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'package:flutter_app/l10n/app_strings.dart';
import 'package:flutter_app/models/take_home.dart';

/// "Take it home" suggestions (Channel3). Loaded only on tap so idle carts do not spend search quota.
/// Mirrors the web panel: same keys, same disclosure, links open the retailer's own page.
class TakeHomeCard extends StatefulWidget {
  final String lang;
  final Future<TakeHomeResult> Function() load;
  final Future<void> Function(Uri url)? onOpen;

  const TakeHomeCard({super.key, required this.lang, required this.load, this.onOpen});

  @override
  State<TakeHomeCard> createState() => _TakeHomeCardState();
}

enum _Phase { idle, loading, off, error, done }

class _TakeHomeCardState extends State<TakeHomeCard> {
  _Phase _phase = _Phase.idle;
  List<TakeHomeItem> _items = const <TakeHomeItem>[];

  String _t(String key) => AppStrings.get(widget.lang, key);

  Future<void> _run() async {
    setState(() => _phase = _Phase.loading);
    try {
      final r = await widget.load();
      if (!mounted) return;
      setState(() {
        _items = r.items;
        _phase = r.enabled ? _Phase.done : _Phase.off;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _phase = _Phase.error);
    }
  }

  Future<void> _open(String url) async {
    final uri = Uri.parse(url);
    final open = widget.onOpen;
    if (open != null) {
      await open(uri);
    } else {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final small = Theme.of(context).textTheme.bodySmall;
    final children = <Widget>[
      Text(_t('takehome.title'), style: const TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 6),
    ];
    switch (_phase) {
      case _Phase.idle:
        children.add(OutlinedButton(
          key: const Key('take-home-load'),
          onPressed: _run,
          child: Text(_t('takehome.btn')),
        ));
      case _Phase.loading:
        children.add(Text(_t('takehome.loading')));
      case _Phase.off:
        children.add(Text(_t('takehome.off'), style: small));
      case _Phase.error:
        children
          ..add(Text(_t('takehome.error'), style: small))
          ..add(TextButton(onPressed: _run, child: Text(_t('takehome.btn'))));
      case _Phase.done:
        if (_items.isEmpty) children.add(Text(_t('takehome.none'), style: small));
        for (final it in _items) {
          final meta = [
            it.brand,
            it.merchantDomain,
            if (it.price != null) '${it.price} ${it.currency ?? ''}'.trim(),
          ].whereType<String>().where((e) => e.isNotEmpty).join(' · ');
          children.add(ListTile(
            contentPadding: EdgeInsets.zero,
            dense: true,
            title: Text(it.title, maxLines: 2, overflow: TextOverflow.ellipsis),
            subtitle: meta.isEmpty ? null : Text(meta),
            trailing: const Icon(Icons.open_in_new, size: 18),
            onTap: () => _open(it.url),
          ));
        }
        children.add(Text(_t('takehome.disclosure'), style: small));
    }
    return Card(
      key: const Key('take-home'),
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
      ),
    );
  }
}
