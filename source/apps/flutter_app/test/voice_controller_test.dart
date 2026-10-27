import 'dart:async';

import 'package:test/test.dart';

import 'package:flutter_app/services/voice_controller.dart';
import 'package:flutter_app/services/voice_recognizer.dart';

/// Controllable fake recognizer. The test drives partial/final results and errors
/// through the captured callbacks; it never needs a real device or plugin.
class FakeRecognizer implements VoiceRecognizer {
  FakeRecognizer({this.initReturns = true});

  final bool initReturns;
  bool _available = false;
  bool isListeningNow = false;
  VoiceTextCallback? onText;
  void Function(String)? onError;

  @override
  Future<bool> init() async {
    _available = initReturns;
    return initReturns;
  }

  @override
  bool get isAvailable => _available;

  @override
  bool get isListening => isListeningNow;

  @override
  Future<void> start({
    required VoiceTextCallback onText,
    required void Function(String message) onError,
  }) async {
    isListeningNow = true;
    this.onText = onText;
    this.onError = onError;
    // Stay open; the test drives results (and stop/cancel) explicitly.
  }

  @override
  Future<void> stop() async {
    isListeningNow = false;
  }

  @override
  Future<void> cancel() async {
    isListeningNow = false;
  }
}

void main() {
  group('VoiceController', () {
    test('probe reports availability and idles when ready', () async {
      final fake = FakeRecognizer(initReturns: true);
      final controller = VoiceController(recognizer: fake);
      await controller.probe();
      expect(controller.available, isTrue);
      expect(controller.state, VoiceState.idle);
    });

    test('successful recognition -> review with the transcript', () async {
      final fake = FakeRecognizer();
      final controller = VoiceController(recognizer: fake);
      await controller.probe();
      await controller.start();
      expect(controller.isListening, isTrue);

      fake.onText!('I want a latte', false);
      expect(controller.text, 'I want a latte');

      fake.onText!('I want a latte', true);
      expect(controller.state, VoiceState.review);
      expect(controller.isListening, isFalse);
      expect(controller.text, 'I want a latte');
    });

    test('empty final result -> idle, never a false "review"', () async {
      final fake = FakeRecognizer();
      final controller = VoiceController(recognizer: fake);
      await controller.probe();
      await controller.start();
      fake.onText!('', true);
      expect(controller.state, VoiceState.idle);
      expect(controller.text, isEmpty);
    });

    test('permission error -> denied (text chat still usable)', () async {
      final fake = FakeRecognizer();
      final controller = VoiceController(recognizer: fake);
      await controller.probe();
      await controller.start();
      fake.onError!('permission denied by user');
      expect(controller.state, VoiceState.denied);
      // Regression: a denied permission is recoverable, so the mic must stay
      // visible. Previously this flipped `available` to false, which hid the
      // button and made the UI claim voice was unsupported on the device.
      expect(controller.available, isTrue);
      // Retrying after the shopper grants the permission must work again.
      await controller.start();
      expect(controller.state, VoiceState.listening);
    });

    test('recognition error -> error state', () async {
      final fake = FakeRecognizer();
      final controller = VoiceController(recognizer: fake);
      await controller.probe();
      await controller.start();
      fake.onError!('network unavailable');
      expect(controller.state, VoiceState.error);
    });

    test('cancel discards the partial transcript', () async {
      final fake = FakeRecognizer();
      final controller = VoiceController(recognizer: fake);
      await controller.probe();
      await controller.start();
      fake.onText!('half said', false);
      await controller.cancel();
      expect(controller.state, VoiceState.idle);
      expect(controller.text, isEmpty);
    });

    test('unavailable engine -> hidden, start is a safe no-op', () async {
      final fake = FakeRecognizer(initReturns: false);
      final controller = VoiceController(recognizer: fake);
      await controller.probe();
      expect(controller.available, isFalse);
      expect(controller.state, VoiceState.unavailable);

      await controller.start();
      expect(controller.state, VoiceState.unavailable);
      expect(controller.isListening, isFalse);
    });

    test('duplicate start while listening is ignored', () async {
      final fake = FakeRecognizer();
      final controller = VoiceController(recognizer: fake);
      await controller.probe();
      await controller.start();
      final before = fake.onText;
      await controller.start(); // must be a no-op
      expect(controller.isListening, isTrue);
      expect(fake.onText, same(before));
    });

    test('nothing is sent until the user confirms (onMessageSent resets)',
        () async {
      final fake = FakeRecognizer();
      final controller = VoiceController(recognizer: fake);
      await controller.probe();
      await controller.start();
      fake.onText!('order milk', false);
      fake.onText!('order milk', true);

      // In review the transcript is held but NOT transmitted anywhere.
      expect(controller.text, 'order milk');
      expect(controller.isListening, isFalse);

      // The UI calls this only after the user presses Send.
      controller.onMessageSent();
      expect(controller.text, isEmpty);
      expect(controller.state, VoiceState.idle);
    });

    test('recognized text is exposed so the user can edit it', () async {
      final fake = FakeRecognizer();
      final controller = VoiceController(recognizer: fake);
      await controller.probe();
      await controller.start();
      fake.onText!('buy bread', true);
      // The UI copies controller.text into the editable TextField; the user may
      // change it before sending.
      expect(controller.text, 'buy bread');
    });

    test('timeout with no speech -> idle (empty result handled)', () async {
      final fake = FakeRecognizer();
      final controller = VoiceController(
        recognizer: fake,
        listenTimeout: const Duration(milliseconds: 80),
      );
      await controller.probe();
      await controller.start();
      expect(controller.isListening, isTrue);
      await Future<void>.delayed(const Duration(milliseconds: 200));
      expect(controller.state, VoiceState.idle);
      expect(controller.text, isEmpty);
    });
  });
}
