import 'package:flutter/material.dart';

import 'package:flutter_app/widgets/coco_cup_painter.dart';

/// The AI Café / Coco brand mark used in the app bar lockup and empty states.
///
/// Web parity: the web header badge is a simple three-path outline cup
/// (`buildCocoSvg()`), so this renders the identical outline. The old version
/// stacked a filled `Icons.local_cafe_rounded` plus a floating dot on a
/// rounded square, which read as an unidentifiable icon at small sizes.
class BrandMark extends StatelessWidget {
  final double size;
  final Color? color;
  final Color? backgroundColor;

  const BrandMark({
    super.key,
    this.size = 36,
    this.color,
    this.backgroundColor,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final fg = color ?? scheme.primary;
    return Semantics(
      image: true,
      label: 'AI Café Coco logo',
      container: true,
      child: Container(
        width: size,
        height: size,
        decoration: backgroundColor == null
            ? null
            : BoxDecoration(color: backgroundColor, shape: BoxShape.circle),
        alignment: Alignment.center,
        child: SizedBox(
          width: size,
          height: size,
          child: CustomPaint(
            key: const Key('brand-mark-coco'),
            painter: CocoCupPainter(color: fg, strokeScale: 1.15),
          ),
        ),
      ),
    );
  }
}
