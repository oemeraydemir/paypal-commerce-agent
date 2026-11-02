import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/services/session_service.dart';

void main() {
  group('InMemorySessionStorage', () {
    test('starts empty and round-trips a session', () async {
      final storage = InMemorySessionStorage();
      expect(await storage.getSessionId(), isNull);
      expect(await storage.getToken(), isNull);

      await storage.saveSession(sessionId: 'sess-1', token: 'tok-1');
      expect(await storage.getSessionId(), 'sess-1');
      expect(await storage.getToken(), 'tok-1');
    });

    test('clear() removes the persisted identity', () async {
      final storage = InMemorySessionStorage();
      await storage.saveSession(sessionId: 'sess-1', token: 'tok-1');
      await storage.clear();
      expect(await storage.getSessionId(), isNull);
      expect(await storage.getToken(), isNull);
    });

    test('saveSession overwrites an existing session', () async {
      final storage = InMemorySessionStorage();
      await storage.saveSession(sessionId: 'old', token: 'old-tok');
      await storage.saveSession(sessionId: 'new', token: 'new-tok');
      expect(await storage.getSessionId(), 'new');
      expect(await storage.getToken(), 'new-tok');
    });
  });

  group('Session', () {
    test('carries the server-issued identity', () {
      const session = Session(
        sessionId: 's',
        token: 't',
        expiresAt: '2099-01-01T00:00:00.000Z',
      );
      expect(session.sessionId, 's');
      expect(session.token, 't');
      expect(session.expiresAt, '2099-01-01T00:00:00.000Z');
    });
  });
}
