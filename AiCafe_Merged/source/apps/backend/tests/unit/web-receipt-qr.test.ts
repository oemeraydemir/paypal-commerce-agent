import fs from 'fs';
import path from 'path';
import vm from 'vm';

const pub = path.join(__dirname, '../../public');

describe('storefront: receipt QR', () => {
  test('qr.js and the verify page ship with the storefront and use no inline script', () => {
    expect(fs.readFileSync(path.join(pub, 'index.html'), 'utf8')).toContain('/qr.js');
    const verify = fs.readFileSync(path.join(pub, 'verify.html'), 'utf8');
    expect(verify).toContain('src="/verify.js"');
    expect(verify).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    expect(fs.readFileSync(path.join(pub, 'verify.js'), 'utf8')).not.toMatch(/innerHTML/);
    expect(fs.readFileSync(path.join(pub, 'app.js'), 'utf8')).toContain('qrBlock');
  });

  test('the share link fits a small, scannable QR code (not a dense one)', () => {
    const ctx: any = {};
    vm.runInNewContext(fs.readFileSync(path.join(pub, 'qr.js'), 'utf8') + '\nglobalThis.qrcode = qrcode;', ctx);
    const link = 'https://aicafe.onrender.com/verify.html#' + '0b9d6f1e-7a3c-4c52-9f0e-1d2a3b4c5d6e' + '.' + 'A'.repeat(86);
    const q = ctx.qrcode(0, 'M');
    q.addData(link);
    q.make();
    expect(q.getModuleCount()).toBeLessThanOrEqual(65);
    expect(q.createDataURL(4, 4)).toMatch(/^data:image\/gif;base64,/);
  });
});
