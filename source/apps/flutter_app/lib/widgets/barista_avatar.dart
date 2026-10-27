import 'package:flutter/material.dart';

/// Brand-aligned "Coco" barista avatar for the AI assistant.
///
/// A small, self-contained vector-style avatar drawn with Flutter primitives
/// (no image assets, no third-party packages). It is used as a visual
/// identifier for assistant (AI) chat messages so a user can instantly tell a
/// barista reply from their own.
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
      child: SizedBox(
        width: size,
        height: size,
        child: CustomPaint(
          painter: _BaristaAvatarPainter(
            background: scheme.primaryContainer,
            backgroundBorder: scheme.primary,
            cup: scheme.primary,
            cupHighlight: scheme.onPrimaryContainer,
            steam: scheme.onSurfaceVariant,
            face: scheme.onPrimaryContainer,
          ),
        ),
      ),
    );
  }
}

class _BaristaAvatarPainter extends CustomPainter {
  final Color background;
  final Color backgroundBorder;
  final Color cup;
  final Color cupHighlight;
  final Color steam;
  final Color face;

  _BaristaAvatarPainter({
    required this.background,
    required this.backgroundBorder,
    required this.cup,
    required this.cupHighlight,
    required this.steam,
    required this.face,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final radius = size.shortestSide / 2;

    // Background disc.
    canvas.drawCircle(center, radius, Paint()..color = background);
    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..color = backgroundBorder
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5,
    );

    // Coffee cup body.
    final cupWidth = radius * 0.9;
    final cupHeight = radius * 0.7;
    final cupRect = Rect.fromLTWH(
      center.dx - cupWidth / 2,
      center.dy - cupHeight / 2,
      cupWidth,
      cupHeight,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(cupRect, const Radius.circular(6)),
      Paint()..color = cup,
    );

    // Handle.
    final handlePath = Path()
      ..moveTo(cupRect.right - 0.5, cupRect.top + cupHeight * 0.28)
      ..quadraticBezierTo(
        cupRect.right + cupWidth * 0.38,
        cupRect.top + cupHeight * 0.45,
        cupRect.right - 0.5,
        cupRect.bottom - cupHeight * 0.28,
      );
    canvas.drawPath(
      handlePath,
      Paint()
        ..color = cup
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3.5
        ..strokeCap = StrokeCap.round,
    );

    // Steam curls above the cup.
    final steamPaint = Paint()
      ..color = steam
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.2
      ..strokeCap = StrokeCap.round;
    final steamTop = cupRect.top - radius * 0.12;
    for (var i = 0; i < 3; i++) {
      final dx = cupRect.left + cupWidth * (0.3 + 0.2 * i);
      final path = Path()
        ..moveTo(dx, steamTop)
        ..quadraticBezierTo(dx + 3, steamTop - 4, dx, steamTop - 8)
        ..quadraticBezierTo(dx - 3, steamTop - 12, dx, steamTop - 16);
      canvas.drawPath(path, steamPaint);
    }

    // Friendly face on the cup (two eyes + a smile).
    final eyePaint = Paint()
      ..color = face
      ..strokeWidth = 2.2
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
    final eyeY = cupRect.top + cupHeight * 0.42;
    final eyeDx = cupWidth * 0.24;
    canvas.drawLine(
      Offset(cupRect.left + eyeDx - 2.5, eyeY),
      Offset(cupRect.left + eyeDx + 2.5, eyeY),
      eyePaint,
    );
    canvas.drawLine(
      Offset(cupRect.right - eyeDx - 2.5, eyeY),
      Offset(cupRect.right - eyeDx + 2.5, eyeY),
      eyePaint,
    );
    final smile = Path()
      ..moveTo(cupRect.left + cupWidth * 0.35, eyeY + 5)
      ..quadraticBezierTo(
        center.dx,
        eyeY + 10,
        cupRect.right - cupWidth * 0.35,
        eyeY + 5,
      );
    canvas.drawPath(smile, eyePaint);
  }

  @override
  bool shouldRepaint(covariant _BaristaAvatarPainter oldDelegate) =>
      oldDelegate.background != background ||
      oldDelegate.backgroundBorder != backgroundBorder ||
      oldDelegate.cup != cup ||
      oldDelegate.cupHighlight != cupHighlight ||
      oldDelegate.steam != steam ||
      oldDelegate.face != face;
}
