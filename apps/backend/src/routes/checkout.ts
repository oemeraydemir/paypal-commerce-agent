import { Request, Response, Router } from 'express';
import { AppError } from '../middleware/error-handler';

const router = Router();

function checkoutReturn(status: 'success' | 'cancel') {
  return (req: Request, res: Response) => {
    const token = req.query.token;
    if (typeof token !== 'string' || token.length === 0) {
      throw new AppError(400, 'PayPal order token is required');
    }

    const title = status === 'success' ? 'Payment approved' : 'Checkout cancelled';
    const message =
      status === 'success'
        ? 'Return to AI Café to confirm and capture your payment.'
        : 'No payment was captured. Return to AI Café to continue shopping.';
    const appLink = `paypalcommerceagent://checkout/${status}?token=${encodeURIComponent(token)}`;

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
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>${message}</p>
      <a href="${appLink}">Return to AI Café</a>
    </main>
  </body>
</html>`);
  };
}

router.get('/checkout/return', checkoutReturn('success'));
router.get('/checkout/cancel', checkoutReturn('cancel'));

export default router;
