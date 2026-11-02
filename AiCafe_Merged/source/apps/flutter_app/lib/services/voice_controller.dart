import 'dart:async';

import 'package:flutter_app/services/voice_recognizer.dart';

/// Lifecycle of a single voice-capture interaction.
enum VoiceState {
  /// Ready; no transcript pending.
  idle,

  /// Probing engine availability.
  initializing,

  /// Actively capturing audio.
  listening,

  /// Final transcript is ready; the user can edit it and confirm to send.
  review,

  /// Recoverable recognition error (network/engine). Text chat still works.
  error,

  /// Microphone / speech-recognition permission was denied.
  denied,

  /// The engine is not available on this device/browser. Mic is hidden.
  unavailable,
}

/// Owns the voice-capture state machine and drives a [VoiceRecognizer].
///
/// This class is intentionally **pure Dart** (no Flutter dependency) so the
/// risky logic — duplicate suppression, no-send-before-confirm, empty/timeout/
/// error/denied handling — is unit-testable without a device or the Flutter
/// runtime. The UI wires a real [VoiceRecognizer] and renders [state].
///
/// Privacy: nothing is persisted. The transcript lives only in memory and is
/// reset on send/cancel.
class VoiceController {
  final VoiceRecognizer recognizer;
  final Duration listenTimeout;

  VoiceState _state = VoiceState.idle;
  String _text = '';
  String? _error;
  bool _available = false;
  Timer? _timeout;

  final Set<void Function()> _listeners = {};

  VoiceController({
    required this.recognizer,
    this.listenTimeout = const Duration(seconds: 15),
  });

  VoiceState get state => _state;
  String get text => _text;
  String? get error => _error;
  bool get available => _available;
  bool get isListening => _state == VoiceState.listening;

  void addListener(void Function() listener) => _listeners.add(listener);
  void removeListener(void Function() listener) => _listeners.remove(listener);
  void _notify() {
    for (final listener in List.of(_listeners)) {
      listener();
    }
  }

  /// Probes availability. Safe to call from a widget's initState.
  Future<void> probe() async {
    _state = VoiceState.initializing;
    _notify();
    try {
      _available = await recognizer.init();
    } catch (_) {
      _available = false;
    }
    _state = _available ? VoiceState.idle : VoiceState.unavailable;
    _notify();
  }

  /// Starts listening. No-op while already listening (duplicate-request guard).
  Future<void> start() async {
    if (!_available || _state == VoiceState.listening) return;
    _error = null;
    _text = '';
    _state = VoiceState.listening;
    _notify();
    _timeout = Timer(listenTimeout, _onTimeout);
    try {
      await recognizer.start(onText: _onText, onError: _onError);
    } catch (e) {
      _timeout?.cancel();
      _setError(e);
    }
  }

  void _onText(String recognized, bool isFinal) {
    _text = recognized;
    if (isFinal) {
      _timeout?.cancel();
      _state = _text.trim().isEmpty ? VoiceState.idle : VoiceState.review;
      _notify();
    } else {
      _notify();
    }
  }

  void _onError(String message) {
    _timeout?.cancel();
    if (message.toLowerCase().contains('permission')) {
      // Keep the engine "available" so the mic stays visible: a denied
      // permission is recoverable (the shopper can grant it and retry) and
      // hiding the button made the app claim voice was unsupported on the
      // device. The banner explains what happened.
      _state = VoiceState.denied;
    } else {
      _error = message;
      _state = VoiceState.error;
    }
    _notify();
  }

  Future<void> _onTimeout() async {
    await recognizer.stop().catchError((_) {});
    // If a final result arrived during stop(), state is already settled.
    if (_state == VoiceState.listening) {
      _state = _text.trim().isEmpty ? VoiceState.idle : VoiceState.review;
      _notify();
    }
  }

  /// Stops listening and keeps the (possibly partial) transcript for review.
  Future<void> stop() async {
    if (_state != VoiceState.listening) return;
    _timeout?.cancel();
    await recognizer.stop().catchError((_) {});
    if (_state == VoiceState.listening) {
      _state = _text.trim().isEmpty ? VoiceState.idle : VoiceState.review;
      _notify();
    }
  }

  /// Cancels listening and discards the transcript.
  Future<void> cancel() async {
    _timeout?.cancel();
    if (_state == VoiceState.listening) {
      await recognizer.cancel().catchError((_) {});
    }
    _text = '';
    _error = null;
    _state = VoiceState.idle;
    _notify();
  }

  /// Called by the UI after the transcript is sent so the same text cannot be
  /// re-sent and the field resets.
  void onMessageSent() {
    _text = '';
    _error = null;
    _state = VoiceState.idle;
    _notify();
  }

  void _setError(Object e) {
    final message = e.toString();
    if (message.toLowerCase().contains('permission')) {
      // Recoverable: keep the mic visible (see [_onError]).
      _state = VoiceState.denied;
    } else {
      _error = message;
      _state = VoiceState.error;
    }
    _notify();
  }

  void dispose() {
    _timeout?.cancel();
    _listeners.clear();
  }
}
