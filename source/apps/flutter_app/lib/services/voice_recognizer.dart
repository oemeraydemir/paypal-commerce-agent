/// Abstraction over a platform speech-to-text engine.
///
/// The app depends only on this interface so the recognition logic is
/// unit-testable without a real device or the `speech_to_text` plugin. The
/// production implementation ([SpeechToTextVoiceRecognizer]) wraps the device's
/// native recognizer; tests use a fake.
///
/// Privacy: implementations must never persist audio or transcripts. They only
/// surface live recognition results through [start]'s callbacks.
typedef VoiceTextCallback = void Function(String recognized, bool isFinal);

abstract class VoiceRecognizer {
  /// Initializes the engine and (on iOS/Android) requests microphone +
  /// speech-recognition permission.
  ///
  /// Returns `true` if speech recognition is available on this device/platform.
  /// A `false` result means the feature should be hidden and the existing text
  /// chat used instead — no fake "working" microphone button is ever shown.
  Future<bool> init();

  /// Whether the engine reported availability after [init].
  bool get isAvailable;

  /// Begins listening. Partial results arrive with [onText](_, false); the final
  /// utterance arrives with [onText](_, true). [onError] reports a recoverable
  /// engine error (e.g. permission denied, no network for the on-device assist).
  ///
  /// Implementations must NOT auto-send anything — the recognized text is handed
  /// back for the user to review and confirm.
  Future<void> start({
    required VoiceTextCallback onText,
    required void Function(String message) onError,
  });

  /// Stops listening and finalizes the current utterance.
  Future<void> stop();

  /// Cancels listening and discards any partial transcript.
  Future<void> cancel();

  /// True while actively capturing audio.
  bool get isListening;
}
