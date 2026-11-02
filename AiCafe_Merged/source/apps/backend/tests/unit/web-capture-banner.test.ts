import { readFileSync } from 'fs';
import { join } from 'path';

// Regression: after a successful capture the "Confirm payment" approval banner
// must be dismissed so the receipt is the only payment state on screen.
describe('storefront capture banner', () => {
  const js = readFileSync(join(__dirname, '../../public/app.js'), 'utf8');

  it('hides the approval banner before rendering the receipt', () => {
    const hide = js.indexOf("b.hidden = true; b.textContent = '';");
    const receipt = js.indexOf('renderReceipt({ orderId: pend.orderId');
    expect(hide).toBeGreaterThan(-1);
    expect(receipt).toBeGreaterThan(hide);
  });
});
