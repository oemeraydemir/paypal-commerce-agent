import crypto from 'crypto';

// Prints a fresh Ed25519 private key for MANDATE_SIGNING_KEY (PKCS#8 PEM, newlines written as \\n so it
// fits on one line of a .env file or a Render environment variable).
const { privateKey } = crypto.generateKeyPairSync('ed25519');
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString().trim();
console.log('MANDATE_SIGNING_KEY=' + pem.replace(/\n/g, '\\n'));
