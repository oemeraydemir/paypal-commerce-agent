# Deployment Guide

This project is a Node.js + TypeScript Express backend intended for a simple Render deployment. The app keeps the public dashboard read-only and stores orders in memory; it is a sandbox hackathon demo, not a production payment service.

## Deployment target

Recommended deployment target: Render Web Service.

### Required runtime configuration

Set the following environment variables in the Render dashboard:

- NODE_ENV=production
- PORT=10000
- CORS_ORIGIN=https://<your-service>.onrender.com
- PAYPAL_ENABLED=true
- PAYPAL_CLIENT_ID=<PayPal sandbox app ID>
- PAYPAL_CLIENT_SECRET=<PayPal sandbox secret>
- PAYPAL_ENV=sandbox
- PAYPAL_RETURN_URL=https://<your-service>.onrender.com/api/checkout/return
- PAYPAL_CANCEL_URL=https://<your-service>.onrender.com/api/checkout/cancel
- PAYPAL_WEBHOOK_ID=<optional sandbox webhook ID>
- OPENAI_API_KEY=<OpenAI API key>

Use Render's secret environment-variable prompt for PayPal credentials and the
OpenAI key. The committed `render.yaml` marks these values `sync: false` and
derives the default checkout return URLs from `RENDER_EXTERNAL_URL`.

## Build and start

Render will build and run from `apps/backend` using:

- Build command: `npm install && npm run build`
- Start command: `npm start`

The `render.yaml` file in this directory is a minimal deployment definition for the backend service.

## Operational notes

- This app uses an in-memory order store. Restarts lose all orders.
- The public dashboard should remain read-only and non-authenticated to follow the Sprint 7 design constraints.
- Webhook verification remains server-side and authoritative; the client is never trusted to set the order origin.
- PayPal live mode is rejected by configuration; this project is sandbox-only.
- The checkout return routes present a link back to the Flutter app. The app
  validates the returned PayPal order token before allowing the shopper to
  confirm capture.
- Use sandbox credentials in hackathon/demo environments. Do not commit
  secrets or production credentials to the repo.

## Smoke verification after deployment

After deployment, validate these URLs:

1. `https://<your-service>/api/health`
2. `https://<your-service>/api/catalog`
3. `https://<your-service>/api/orders?limit=5`
4. `https://<your-service>/api/orders/stats`
5. `https://<your-service>/dashboard`

This project is a demo deployment, not a production-grade payment system. The
backend is designed for sandbox checkout, a read-only public summary, and
demonstration only.
