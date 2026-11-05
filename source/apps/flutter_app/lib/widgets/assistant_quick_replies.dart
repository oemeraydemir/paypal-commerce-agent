import 'package:flutter/material.dart';

import 'package:flutter_app/l10n/app_strings.dart';
import 'package:flutter_app/utils/quick_replies.dart';

/// Passing no callback leaves older/in-flight choices visibly disabled.
class AssistantQuickReplies extends StatelessWidget {
  final String response;
  final ValueChanged<String>? onSelected;

  const AssistantQuickReplies({
    super.key,
    required this.response,
    this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    final options = extractQuickReplies(response);
    if (options.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            t(context, 'options.hint'),
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 4),
          Wrap(
            spacing: 6,
            runSpacing: 4,
            children: [
              for (final option in options)
                ActionChip(
                  key: ValueKey('quick-reply-${option.id}'),
                  label: Text(
                    '${option.id}. ${option.label}',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  tooltip: '${t(context, 'options.select')} ${option.id}: '
                      '${option.label}',
                  onPressed: onSelected == null
                      ? null
                      : () => onSelected!(option.id),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
