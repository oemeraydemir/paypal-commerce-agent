import 'package:flutter/material.dart';

/// A small rectangular café brand mark used in the header lockup and in empty
/// states. Pure vector, so it stays crisp at any size.
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
    final bg = backgroundColor ?? scheme.primary.withValues(alpha: 0.10);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(size * 0.28),
      ),
      alignment: Alignment.center,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Icon(
            Icons.local_cafe_rounded,
            size: size * 0.52,
            color: fg,
          ),
          Positioned(
            top: size * 0.20,
            right: size * 0.22,
            child: Container(
              width: size * 0.18,
              height: size * 0.18,
              decoration: BoxDecoration(
                color: fg.withValues(alpha: 0.9),
                shape: BoxShape.circle,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
