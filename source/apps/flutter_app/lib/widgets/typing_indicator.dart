import 'package:flutter/material.dart';

/// A lightweight, accessible "AI is typing…" indicator.
///
/// Three dots gently pulse (opacity) in sequence. Self-contained: requires no
/// extra packages and works in any Material context. Included so the chat UI
/// clearly distinguishes "generating a reply" from "no reply yet".
class TypingIndicator extends StatefulWidget {
  final double dotSize;

  const TypingIndicator({super.key, this.dotSize = 8});

  @override
  State<TypingIndicator> createState() => _TypingIndicatorState();
}

class _TypingIndicatorState extends State<TypingIndicator>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.onSurfaceVariant;
    return Semantics(
      label: 'AI is typing',
      liveRegion: true,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          return Row(
            mainAxisSize: MainAxisSize.min,
            children: List.generate(3, (index) {
              // Phase each dot so they pulse one after another.
              final phase = ((_controller.value * 3 + index) % 3) / 3;
              final opacity = 0.25 + 0.75 * (1 - (phase - 0.5).abs() * 2).clamp(0.0, 1.0);
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2.5),
                child: Opacity(
                  opacity: opacity,
                  child: Container(
                    width: widget.dotSize,
                    height: widget.dotSize,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: color,
                    ),
                  ),
                ),
              );
            }),
          );
        },
      ),
    );
  }
}
