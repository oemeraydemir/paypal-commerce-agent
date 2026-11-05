import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'package:flutter_app/services/session_service.dart';

/// Minimal storage backend so [SecureSessionStorage] can be unit-tested without
/// the `flutter_secure_storage` plugin or any platform channels (F6).
abstract class SecureBackend {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

/// Adapts the real [FlutterSecureStorage] to [SecureBackend].
class _FlutterBackend implements SecureBackend {
  final FlutterSecureStorage _storage;

  _FlutterBackend([FlutterSecureStorage? storage])
    : _storage = storage ?? const FlutterSecureStorage();

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}

/// Stores the session identity in the platform secure store.
///
/// Kept in its own file so the rest of the app (and the unit tests) can depend
/// on [SessionStorage] without pulling in the `flutter_secure_storage` plugin.
///
/// Failure handling (F6): a read failure is treated as "no session" so the app
/// re-establishes one instead of getting stuck; a write failure is surfaced as
/// [SessionException] (the caller fails clearly rather than silently); `clear`
/// is best-effort. This keeps the app able to obtain a session even when the
/// underlying secure store is temporarily unavailable (e.g. keystore/encryption
/// hiccup, or a restored OS backup holding an undecryptable key).
class SecureSessionStorage implements SessionStorage {
  static const String _sessionIdKey = 'session_id';
  static const String _tokenKey = 'session_token';

  final SecureBackend _backend;

  /// [backend] is injectable so tests can supply a fake; [storage] wraps the real
  /// encrypted store when no backend is supplied.
  SecureSessionStorage({SecureBackend? backend, FlutterSecureStorage? storage})
    : _backend = backend ?? _FlutterBackend(storage);

  @override
  Future<String?> getSessionId() async {
    try {
      return await _backend.read(_sessionIdKey);
    } catch (_) {
      // Secure store unreadable: behave as if there is no session so the caller
      // re-creates one (F6 recovery).
      return null;
    }
  }

  @override
  Future<String?> getToken() async {
    try {
      return await _backend.read(_tokenKey);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> saveSession({
    required String sessionId,
    required String token,
  }) async {
    try {
      await _backend.write(_sessionIdKey, sessionId);
      await _backend.write(_tokenKey, token);
    } catch (e) {
      // Surface a clear, typed failure instead of an obscure platform error.
      throw SessionException('Could not persist the session: $e');
    }
  }

  @override
  Future<void> clear() async {
    // Best-effort: failing to clear must not crash the retry path.
    try {
      await _backend.delete(_sessionIdKey);
      await _backend.delete(_tokenKey);
    } catch (_) {
      // ignore
    }
  }
}
