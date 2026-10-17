#!/usr/bin/env node
// Probes POST /api/ai/chat against a running backend and prints the response
// envelope, so the rule-based fallback shape is observed rather than assumed.
// Usage: node evidence/scripts/probe-chat.mjs [baseUrl] [message]

const baseUrl = process.argv[2] || 'http://127.0.0.1:3000';
const message = process.argv[3] || 'I want coffee and a croissant';

const sessionRes = await fetch(`${baseUrl}/api/sessions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}',
});
if (!sessionRes.ok) {
  console.error(`session failed: HTTP ${sessionRes.status}`);
  process.exit(1);
}
const session = await sessionRes.json();

const chatRes = await fetch(`${baseUrl}/api/ai/chat`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'X-Session-Id': session.sessionId,
    Authorization: `Bearer ${session.sessionToken}`,
  },
  body: JSON.stringify({ sessionId: session.sessionId, message }),
});

const text = await chatRes.text();
console.log(`HTTP ${chatRes.status}`);
let body;
try {
  body = JSON.parse(text);
} catch {
  console.log(text);
  process.exit(0);
}

const cart = body.preparedCart;
console.log(
  JSON.stringify(
    {
      mode: body.mode,
      checkoutReady: body.checkoutReady,
      toolRounds: body.toolRounds,
      messageCount: body.messageCount,
      response: body.response,
      preparedCart: cart
        ? {
            itemCount: Array.isArray(cart.items) ? cart.items.length : null,
            totalFormatted: cart.totalFormatted,
            currency: cart.currency,
            policyDecision: cart.policyDecision,
            requiresExplicitApproval: cart.requiresExplicitApproval,
            retrySuggested: cart.retrySuggested,
            policyViolations: cart.policyViolations,
            reason: cart.reason,
            cartId: cart.cartId,
          }
        : null,
    },
    null,
    2
  )
);
