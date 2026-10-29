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

  // Render gibi platformlarda self-signed sertifika yaygındır.
  // Açıkça 'true' belirtilmedikçe, üretimde bağlantıyı engellememek için false varsayılır.
  const isRejectUnauthorizedTrue =
    config.rejectUnauthorized === true || config.rejectUnauthorized === 'true';

  const sslOptions: any = {
    rejectUnauthorized: isRejectUnauthorizedTrue,
  };

  if (config.ca) {
    sslOptions.ca = config.ca;
  }

  return sslOptions;
}