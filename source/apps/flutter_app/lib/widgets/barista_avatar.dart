import 'package:flutter/material.dart';

import 'package:flutter_app/widgets/coco_cup_painter.dart';

/// Brand-aligned "Coco" barista avatar for the AI assistant.
///
/// Web parity: the web uses the same clean outline cup for the header badge
/// and for assistant messages. The previous Flutter avatar drew a filled cup,
/// a handle, three steam curls, two eyes and a smile on top of each other; at
/// 28-34dp in a chat bubble that was an unreadable smudge. Now it is a quiet
/// tinted disc carrying exactly the same three outline paths.
class BaristaAvatar extends StatelessWidget {
  final double size;

  const BaristaAvatar({super.key, this.size = 40});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      image: true,
      label: 'Coco, AI barista',
      container: true,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: scheme.primaryContainer.withValues(alpha: 0.55),
          shape: BoxShape.circle,
        ),
        alignment: Alignment.center,
        child: SizedBox(
          width: size * 0.78,
          height: size * 0.78,
          child: CustomPaint(
            painter: CocoCupPainter(color: scheme.primary, strokeScale: 1.3),
          ),
        ),
      ),
    );
  }
}
