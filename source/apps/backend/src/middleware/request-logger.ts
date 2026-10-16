import morgan from 'morgan';

// Secret redaction policy (CRITICAL FIX #7): never log Authorization headers,
// PayPal credentials, or OPENAI_API_KEY. Anything sensitive in the log stream
// is replaced with [REDACTED] before it reaches the console.
const skipPaths = ['/api/health'];

function redact(message: string): string {
  return message
    // Authorization header
    .replace(/Authorization:[^\s]+/gi, 'Authorization: [REDACTED]')
    // Generic PayPal-* headers (PayPal-Auth-Assertion, PayPal-Request-Id, ...)
    .replace(/PayPal-[A-Za-z-]+:\s*[^\s]+/gi, (match) => {
      const header = match.split(':')[0];
      return `${header}: [REDACTED]`;
    })
    // Any value that looks like a secret / key
    .replace(/([Aa]uthorization|[Pp]assword|[Ss]ecret|[Aa]pi[_-]?[Kk]ey|OPENAI_API_KEY|PAYPAL_CLIENT_SECRET)=[^\s]+/g, '$1=[REDACTED]')
    // Bearer tokens inside URLs/query strings
    .replace(/([Tt]oken|access_token)=[^\s&]+/g, '$1=[REDACTED]');
}

export const requestLogger = morgan('combined', {
  // morgan runs at the app level, so req.url is the full path (e.g. /api/health).
  skip: (req) => typeof req.url === 'string' && skipPaths.some((p) => req.url!.startsWith(p)),
  stream: {
    write: (message: string) => {
      console.log(redact(message).trim());
    },
  },
});
