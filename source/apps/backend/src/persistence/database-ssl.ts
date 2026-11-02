export interface DatabaseSslSettings {
  nodeEnv?: string;
  enabled?: string;
  ca?: string;
  rejectUnauthorized?: string;
}

export interface DatabaseSslOptions {
  ca?: string;
  rejectUnauthorized: boolean;
}

/**
 * `pg` parses SSL query parameters from connectionString after it receives the
 * Pool options. In particular, `sslmode` can replace the explicit `ssl` object
 * supplied by the application. Remove only that mode so TLS and certificate
 * policy remain controlled by the environment-specific options below.
 */
export function removeConnectionStringSslMode(connectionString: string): string {
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    // Do not echo the connection string in a configuration error.
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.');
  }

  if (!parsed.searchParams.has('sslmode')) return connectionString;
  parsed.searchParams.delete('sslmode');
  return parsed.toString();
}

/**
 * Resolve PostgreSQL TLS settings. Production defaults to TLS with certificate
 * verification; a custom CA can be supplied for private database certificates.
 * An explicit enabled=false is intended only for trusted private-network URLs.
 */
export function resolveDatabaseSslOptions(
  settings: DatabaseSslSettings,
): DatabaseSslOptions | undefined {
  const enabled = settings.enabled === undefined
    ? settings.nodeEnv === 'production'
    : settings.enabled.toLowerCase() === 'true';
  if (!enabled) return undefined;

  const ca = settings.ca?.trim();
  return {
    ...(ca ? { ca } : {}),
    rejectUnauthorized: settings.rejectUnauthorized?.toLowerCase() !== 'false',
  };
}
