import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'package:flutter_app/l10n/app_strings.dart';
import 'package:flutter_app/models/pickup.dart';
import 'package:flutter_app/services/api_service.dart';

/// Pickup reservation planner (parity with the Web storefront).
///
/// The server owns capacity and remaining-slot math; the client only lists the
/// slots the server returns and passes slot/booking ids back. Reservations are
/// HELD until linked to the order at payment (see [PickupLinkSection]).
class PickupPlannerSheet extends StatefulWidget {
  final ApiService api;
  final String lang;
  final PickupBooking? initialBooking;
  final ValueChanged<PickupBooking?> onBookingChanged;

  const PickupPlannerSheet({
    super.key,
    required this.api,
    required this.lang,
    this.initialBooking,
    required this.onBookingChanged,
  });

  @override
  State<PickupPlannerSheet> createState() => _PickupPlannerSheetState();
}

class _PickupPlannerSheetState extends State<PickupPlannerSheet> {
  List<PickupSlot>? _slots;
  bool _loading = false;
  bool _failed = false;
  String? _error;
  late PickupBooking? _booking;

  String _s(String key) => AppStrings.get(widget.lang, key);

  @override
  void initState() {
    super.initState();
    _booking = widget.initialBooking;
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      final slots = await widget.api.fetchPickupAvailability();
      if (!mounted) return;
      setState(() {
        _slots = slots;
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

  Future<void> _reserve(PickupSlot slot) async {
    setState(() => _error = null);
    try {
      final booking = await widget.api.reservePickupSlot(slot.id);
      if (!mounted) return;
      setState(() => _booking = booking);
      widget.onBookingChanged(booking);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    }
  }

  Future<void> _release() async {
    final booking = _booking;
    if (booking == null) return;
    setState(() => _error = null);
    try {
      await widget.api.releasePickupBooking(booking.bookingId);
      if (!mounted) return;
      setState(() => _booking = null);
      widget.onBookingChanged(null);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    }
  }

  String _timeRange(PickupSlot s) {
    try {
      final start = DateTime.parse(s.startTs);
      final end = DateTime.parse(s.endTs);
      final f = DateFormat('HH:mm', AppStrings.localeTag(widget.lang));
      return '${f.format(start)}–${f.format(end)}';
    } catch (_) {
      return s.startTs;
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _s('pickup.title'),
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 4),
            Text(
              _s('pickup.subtitle'),
              style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
            ),
            const SizedBox(height: 12),
            if (_loading) const LinearProgressIndicator(),
            if (_failed) ...[
              Text(
                _s('pickup.error'),
                style: TextStyle(color: scheme.error, fontSize: 12),
              ),
              TextButton(onPressed: _load, child: const Text('Retry')),
            ],
            if (_slots != null && _slots!.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text(_s('pickup.empty')),
              ),
            if (_slots != null && _slots!.isNotEmpty)
              ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 320),
                child: ListView.separated(
                  shrinkWrap: true,
                  itemCount: _slots!.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    final slot = _slots![i];
                    return ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      title: Text(_timeRange(slot)),
                      subtitle: Text(
                        slot.remaining > 0
                            ? _s('pickup.remaining').replaceAll('%s', '${slot.remaining}')
                            : _s('pickup.full'),
                      ),
                      trailing: slot.isFull || (_booking != null && _booking!.status == 'HELD')
                          ? Text(
                              slot.isFull ? _s('pickup.full') : _s('pickup.reserved'),
                              style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
                            )
                          : OutlinedButton(
                              onPressed: () => _reserve(slot),
                              child: Text(_s('pickup.reserve')),
                            ),
                    );
                  },
                ),
              ),
            if (_booking != null) ...[
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: scheme.primaryContainer,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    Icon(Icons.event_available, color: scheme.onPrimaryContainer),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '${_s('pickup.reserved')}: ${_booking!.bookingId}',
                        style: TextStyle(color: scheme.onPrimaryContainer),
                      ),
                    ),
                    TextButton(
                      onPressed: _release,
                      child: Text(_s('pickup.release')),
                    ),
                  ],
                ),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: TextStyle(color: scheme.error, fontSize: 12)),
            ],
          ],
        ),
      ),
    );
  }
}

/// Small receipt section that links a held pickup reservation to the order
/// being paid (`POST /api/pickup/link`, same-session ownership enforced server-side).
class PickupLinkSection extends StatefulWidget {
  final ApiService api;
  final String orderId;
  final String lang;
  final PickupBooking booking;

  const PickupLinkSection({
    super.key,
    required this.api,
    required this.orderId,
    required this.lang,
    required this.booking,
  });

  @override
  State<PickupLinkSection> createState() => _PickupLinkSectionState();
}

class _PickupLinkSectionState extends State<PickupLinkSection> {
  bool _linking = false;
  bool _linked = false;
  String? _error;

  String _s(String key) => AppStrings.get(widget.lang, key);

  Future<void> _link() async {
    setState(() {
      _linking = true;
      _error = null;
    });
    try {
      await widget.api.linkPickupBooking(
        bookingId: widget.booking.bookingId,
        orderId: widget.orderId,
      );
      if (!mounted) return;
      setState(() {
        _linking = false;
        _linked = true;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _linking = false;
        _error = e.message;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _linking = false;
        _error = '$e';
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
          Row(
            children: [
              Icon(Icons.event_available, color: scheme.primary, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  _s('pickup.title'),
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (_linked)
            Row(
              children: [
                Icon(Icons.check_circle, color: scheme.primary, size: 18),
                const SizedBox(width: 6),
                Text(_s('pickup.linked')),
              ],
            )
          else
            FilledButton.icon(
              key: const Key('pickup-link-to-order'),
              icon: const Icon(Icons.link, size: 18),
              label: Text(
                _linking ? _s('pickup.linking') : _s('pickup.linkToOrder'),
              ),
              onPressed: _linking ? null : _link,
            ),
          if (_error != null) ...[
            const SizedBox(height: 6),
            Text(_error!, style: TextStyle(color: scheme.error, fontSize: 12)),
          ],
        ],
      ),
    );
  }
}
