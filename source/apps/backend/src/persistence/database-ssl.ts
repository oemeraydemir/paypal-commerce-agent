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
