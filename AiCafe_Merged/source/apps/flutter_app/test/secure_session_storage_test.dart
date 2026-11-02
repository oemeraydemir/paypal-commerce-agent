import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/services/session_service.dart';
import 'package:flutter_app/services/secure_session_storage.dart';

/// A backend that always fails, used to exercise the recovery paths (F6).
class _ThrowingBackend implements SecureBackend {
  @override
  Future<String?> read(String key) => throw StateError('backend unavailable');

  @override
  Future<void> write(String key, String value) =>
      throw StateError('backend unavailable');

  @override
  Future<void> delete(String key) => throw StateError('backend unavailable');
}

/// A backend that succeeds, so the happy path can be verified.
class _InMemoryBackend implements SecureBackend {
  final Map<String, String> _data = {};

  @override
  Future<String?> read(String key) async => _data[key];

  @override
  Future<void> write(String key, String value) async => _data[key] = value;

  @override
  Future<void> delete(String key) async => _data.remove(key);
}

void main() {
  group('SecureSessionStorage recovery (F6)', () {
    test('read failure is treated as no session (recoverable)', () async {
      final storage = SecureSessionStorage(backend: _ThrowingBackend());
      expect(await storage.getSessionId(), isNull);
      expect(await storage.getToken(), isNull);
    });

    test('write failure surfaces a typed SessionException', () async {
      final storage = SecureSessionStorage(backend: _ThrowingBackend());
      await expectLater(
        storage.saveSession(sessionId: 's1', token: 't1'),
        throwsA(isA<SessionException>()),
      );
    });

    test('clear is best-effort and never throws on backend failure', () async {
      final storage = SecureSessionStorage(backend: _ThrowingBackend());
      await storage.clear(); // must not throw
    });

    test('happy path round-trips through the injected backend', () async {
      final storage = SecureSessionStorage(backend: _InMemoryBackend());
      await storage.saveSession(sessionId: 's1', token: 't1');
      expect(await storage.getSessionId(), 's1');
      expect(await storage.getToken(), 't1');

      await storage.clear();
      expect(await storage.getSessionId(), isNull);
      expect(await storage.getToken(), isNull);
    });
  });
}
