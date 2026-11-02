// Pluggable, testable persistence for the session identity.
//
// Production uses [SecureSessionStorage] (see `secure_session_storage.dart`,
// which wraps `flutter_secure_storage`). Unit tests inject
// [InMemorySessionStorage] so no Flutter platform channels are required.

/// Thrown when a session cannot be created or the server response is unusable.
class SessionException implements Exception {
  final String message;
  const SessionException(this.message);
  @override
  String toString() => 'SessionException: $message';
}

/// A server-issued session identity returned by `POST /api/sessions`.
class Session {
  final String sessionId;
  final String token;
  final String? expiresAt;
  const Session({required this.sessionId, required this.token, this.expiresAt});
}

/// Contract for persisting the session identity.
abstract class SessionStorage {
  Future<String?> getSessionId();
  Future<String?> getToken();
  Future<void> saveSession({required String sessionId, required String token});
  Future<void> clear();
}

/// In-memory implementation used by unit tests.
class InMemorySessionStorage implements SessionStorage {
  String? _sessionId;
  String? _token;

  @override
  Future<String?> getSessionId() async => _sessionId;

  @override
  Future<String?> getToken() async => _token;

  @override
  Future<void> saveSession({
    required String sessionId,
    required String token,
  }) async {
    _sessionId = sessionId;
    _token = token;
  }

  @override
  Future<void> clear() async {
    _sessionId = null;
    _token = null;
  }
}
