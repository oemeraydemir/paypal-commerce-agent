export interface DatabaseSslConfig {
  nodeEnv?: string;
  enabled?: string | boolean;
  ca?: string;
  rejectUnauthorized?: string | boolean;
}

export function resolveDatabaseSslOptions(config: DatabaseSslConfig): any {
  const isEnabled =
    config.enabled === true ||
    config.enabled === 'true' ||
    config.nodeEnv === 'production';

  if (!isEnabled) {
    return false;
  }

  // Render'ın ücretsiz PostgreSQL'i self-signed sertifika kullanır.
  // Üretim ortamında bağlantının kopmaması için rejectUnauthorized varsayılan olarak false olmalıdır.
  // Sadece açıkça ve kesinlikle 'true' (veya true boolean) verilirse true olur.
  const isRejectUnauthorizedTrue =
    config.rejectUnauthorized === true || config.rejectUnauthorized === 'true';

  return {
    rejectUnauthorized: isRejectUnauthorizedTrue,
    ...(config.ca ? { ca: config.ca } : {}),
  };
}