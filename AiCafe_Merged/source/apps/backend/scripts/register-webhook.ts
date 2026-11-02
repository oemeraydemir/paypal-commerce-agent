#!/usr/bin/env node
import { paypalClient } from '../src/paypal/client';

const webhookUrl = process.argv[2];

if (!webhookUrl) {
  console.error('Usage: npm run register-webhook <webhook-url>');
  console.error(
    'Example: npm run register-webhook https://your-app.onrender.com/api/webhooks/paypal'
  );
  console.error('');
  console.error('For local development, expose the server with ngrok:');
  console.error('  ngrok http 3000');
  console.error(
    '  npm run register-webhook https://<ngrok-id>.ngrok.io/api/webhooks/paypal'
  );
  process.exit(1);
}

async function registerWebhook() {
  try {
    const response = await paypalClient.createWebhook({
      url: webhookUrl,
      event_types: [
        { name: 'PAYMENT.CAPTURE.COMPLETED' },
        { name: 'PAYMENT.CAPTURE.DENIED' },
        { name: 'CHECKOUT.ORDER.APPROVED' },
      ],
    });

    console.log('✅ Webhook registered successfully!');
    console.log('Webhook ID:', response.id);
    console.log('');
    console.log('Add this to your .env file:');
    console.log(`PAYPAL_WEBHOOK_ID=${response.id}`);
  } catch (err: any) {
    console.error('❌ Failed to register webhook:', err?.message ?? err);
    process.exit(1);
  }
}

registerWebhook();
