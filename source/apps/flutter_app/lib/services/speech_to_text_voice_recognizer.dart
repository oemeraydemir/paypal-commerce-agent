import 'package:speech_to_text/speech_recognition_error.dart';
import 'package:speech_to_text/speech_recognition_result.dart';
import 'package:speech_to_text/speech_to_text.dart';

import 'package:flutter_app/services/voice_recognizer.dart';

/// Production [VoiceRecognizer] backed by the device's native speech engine via
/// the `speech_to_text` plugin.
///
/// This uses the platform's own recognizer (Android SpeechRecognizer / iOS
/// SFSpeechRecognizer) and therefore requires **no cloud API key or
/// subscription**. Availability is decided at runtime by [init] — if the device
/// or browser does not support it, the caller hides the microphone and keeps
/// the text chat working.
class SpeechToTextVoiceRecognizer implements VoiceRecognizer {
  final SpeechToText _engine = SpeechToText();
  bool _available = false;
  bool _engineInitialized = false;

  @override
  bool get isAvailable => _available;

  /// Startup probe.
  ///
  /// It must never prompt for the microphone: `SpeechToText.initialize()`
  /// requests RECORD_AUDIO from the OS when the permission is not granted yet,
  /// which produced an unexpected permission dialog on **every** cold start
  /// (observed on the Pixel emulator before the shopper ever touched the mic).
  /// `hasPermission` only reads the current grant state, so when it is not
  /// granted we keep the mic available and defer `initialize()` to the first
  /// explicit tap — that is where an OS permission prompt belongs.
  @override
  Future<bool> init() async {
    try {
      if (!await _engine.hasPermission) {
        _available = true; // show the mic; permission is asked on first use
        return _available;
      }
      _available = await _initializeEngine();
    } catch (_) {
      _available = false;
    }
    return _available;
  }

  Future<bool> _initializeEngine() async {
    if (_engineInitialized) return _engine.isAvailable;
    final ok = await _engine.initialize(
      finalTimeout: const Duration(seconds: 15),
    );
    _engineInitialized = ok;
    return ok;
  }

  Future<bool> _hasPermissionQuietly() async {
    try {
      return await _engine.hasPermission;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<void> start({
    required VoiceTextCallback onText,
    required void Function(String message) onError,
  }) async {
    // First explicit use: initialize now (and, if needed, let the OS ask for
    // the microphone). A failure here is reported as a permission problem when
    // the permission is still missing, so the UI can say "permission denied"
    // instead of the misleading "not available on this device".
    if (!_engineInitialized) {
      final ok = await _initializeEngine();
      if (!ok) {
        final granted = await _hasPermissionQuietly();
        onError(
          granted
              ? 'Speech recognition is not available on this device.'
              : 'permission denied',
        );
        return;
      }
    }
    if (!_engine.isAvailable) {
      onError('Speech recognition is not available on this device.');
      return;
    }
    // In speech_to_text 7.x, listening errors are delivered to the error
    // listener registered on the engine (there is no per-listen onError).
    // We (re)bind it here so each session routes to the caller's callback.
    _engine.errorListener = (SpeechRecognitionError error) {
      onError(error.errorMsg);
    };
    await _engine.listen(
      onResult: (SpeechRecognitionResult result) {
        onText(result.recognizedWords, result.finalResult);
      },
      listenOptions: SpeechListenOptions(
        cancelOnError: true,
        partialResults: true,
        listenMode: ListenMode.dictation,
      ),
    );
  }

  @override
  Future<void> stop() async {
    try {
      await _engine.stop();
    } catch (_) {
      // Best effort; the controller settles state regardless.
    }
  }

  @override
  Future<void> cancel() async {
    try {
      await _engine.cancel();
    } catch (_) {
      // Best effort.
    }
  }

  @override
  bool get isListening => _engine.isListening;
}
