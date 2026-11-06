import 'package:flutter/material.dart';

/// The clean Coco outline cup used by the web storefront (`buildCocoSvg()` in
/// `public/app.js`).
///
/// Web parity: exactly three stroked paths on a 24x24 grid — cup, handle and
/// two steam curls. No filled disc, no face, no extra badge. The previous
/// Flutter avatar stacked a filled cup, three steam curls, two eyes and a
/// smile inside a coloured circle, which became an unreadable blob at 28dp in
/// chat bubbles. Keeping the mark to an outline makes it legible everywhere.
class CocoCupPainter extends CustomPainter {
  final Color color;
  final double strokeScale;

  const CocoCupPainter({required this.color, this.strokeScale = 1.0});

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.shortestSide / 24.0;
    final offsetX = (size.width - 24.0 * scale) / 2.0;
    final offsetY = (size.height - 24.0 * scale) / 2.0;
    double x(double v) => offsetX + v * scale;
    double y(double v) => offsetY + v * scale;

    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.7 * scale * strokeScale
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    // M5 9h11v4a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z
    final cup = Path()
      ..moveTo(x(5), y(9))
      ..lineTo(x(16), y(9))
      ..lineTo(x(16), y(13))
      ..quadraticBezierTo(x(16), y(17), x(12), y(17))
      ..lineTo(x(9), y(17))
      ..quadraticBezierTo(x(5), y(17), x(5), y(13))
      ..close();

    // M16 10h2.6a2.4 2.4 0 0 1 0 4.8H16
    final handle = Path()
      ..moveTo(x(16), y(10))
      ..lineTo(x(18.6), y(10))
      ..cubicTo(x(21.3), y(10), x(21.3), y(14.8), x(18.6), y(14.8))
      ..lineTo(x(16), y(14.8));

    // M8 3.4c0 .9-.7 1.3-.7 2.2M11 3.4c0 .9-.7 1.3-.7 2.2
    final steam = Path()
      ..moveTo(x(8), y(3.4))
      ..cubicTo(x(8), y(4.3), x(7.3), y(4.7), x(7.3), y(5.6))
      ..moveTo(x(11), y(3.4))
      ..cubicTo(x(11), y(4.3), x(10.3), y(4.7), x(10.3), y(5.6));

    canvas.drawPath(cup, paint);
    canvas.drawPath(handle, paint);
    canvas.drawPath(steam, paint);
  }

  @override
  bool shouldRepaint(covariant CocoCupPainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.strokeScale != strokeScale;
}
