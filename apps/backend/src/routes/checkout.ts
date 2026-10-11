import { Request, Response, Router } from 'express';
import { AppError } from '../middleware/error-handler';

const router = Router();

function checkoutReturn(status: 'success' | 'cancel') {
  return (req: Request, res: Response) => {
    const token = req.query.token;
    if (typeof token !== 'string' || token.trim().length === 0) {
      throw new AppError(400, 'PayPal order token is required');
    }

    const title = status === 'success' ? 'Return to AI Café' : 'Checkout cancelled';
    const message =
      status === 'success'
        ? 'Continue in AI Café to validate the PayPal return and confirm capture. This page does not capture payment.'
        : 'No payment was captured. Return to AI Café to continue shopping.';
    const appUrl = new URL(`paypalcommerceagent://checkout/${status}`);
    appUrl.searchParams.set('token', token);
    const appLink = appUrl.toString();
    const htmlAppLink = appLink.replace(/[&<>"']/g, (character) => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      };
      return entities[character];
    });
    const scriptAppLink = JSON.stringify(appLink);

    res
      .status(200)
      .type('html')
      .send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="referrer" content="no-referrer">
    <title>${title} · AI Café</title>
    <script${res.locals.cspNonce ? ` nonce="${res.locals.cspNonce}"` : ''}>
      window.location.replace(${scriptAppLink});
      window.setTimeout(function () {
        document.getElementById('fallback-message').hidden = false;
      }, 1200);
    </script>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>${message}</p>
      <p id="fallback-message">If AI Café did not open automatically, use this link:</p>
      <a href="${htmlAppLink}">Return to AI Café</a>
    </main>
  </body>
</html>`);
  };
}

router.get('/checkout/return', checkoutReturn('success'));
router.get('/checkout/cancel', checkoutReturn('cancel'));

export default router;
