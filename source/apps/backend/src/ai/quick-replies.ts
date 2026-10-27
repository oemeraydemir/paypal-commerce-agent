export interface QuickReply {
  id: string;
  label: string;
}

/** Presentation only. Never derives a cart, price, policy decision or payment. */
export function extractQuickReplies(raw: string): QuickReply[] {
  const options: QuickReply[] = [];
  let table = false;
  let list = false;
  let fence = '';
  let invalid = false;
  const clean = (s: string) => s.replace(/[\uFE0F\u20E3]/g, '').replace(/\*\*|__/g, '').trim();
  const cells = (s: string) => {
    const parts = s.split('|').map((part) => part.trim());
    if (parts[0] === '') parts.shift();
    if (parts[parts.length - 1] === '') parts.pop();
    return parts;
  };
  const add = (first: string, fallback = '') => {
    const match = /^(?:(?:option|seçenek)\s*)?(\d+)(?:\s*[.)\]:-]\s*|\s+|$)(.*)$/i.exec(clean(first));
    if (!match) { invalid = true; return; }
    const label = clean(match[2] || fallback).replace(/\s+/g, ' ');
    if (!label || Number(match[1]) !== options.length + 1 || options.length >= 4) {
      invalid = true;
      return;
    }
    options.push({ id: match[1], label: label.slice(0, 80) });
  };
  for (const source of raw.replace(/\r\n?/g, '\n').split('\n')) {
    const line = source.trim();
    const marker = /^(?:`{3,}|~{3,})/.exec(line);
    if (marker) {
      if (!fence) fence = marker[0][0];
      else if (fence === marker[0][0]) fence = '';
      continue;
    }
    if (fence) continue;
    const parts = cells(line);
    if (parts.length >= 2 && /^(?:options?|seçenek(?:ler)?)$/i.test(clean(parts[0]))) {
      table = true;
      list = false;
      continue;
    }
    if (table && parts.length >= 2) {
      if (parts.every((part) => /^:?-{3,}:?$/.test(part))) continue;
      add(parts[0], parts[1]);
      continue;
    }
    table = false;
    if (/^(?:#{1,6}\s*)?(?:options?|seçenek(?:ler)?)\s*:?$/i.test(clean(line))) {
      list = true;
      continue;
    }
    const candidate = clean(line).replace(/^[-*•]\s+/, '');
    const explicit = /^(?:option|seçenek)\s*\d/i.test(candidate) || /^\d\uFE0F?\u20E3/.test(line.replace(/^(?:[-*•]\s+|\*\*)/, ''));
    if (explicit || (list && /^\d+[.)]\s+/.test(candidate))) {
      add(candidate);
    } else if (line) {
      list = false;
    }
  }
  return !invalid && options.length >= 2 ? options : [];
}

/** Appended after sanitization; also saved in history so short replies retain context. */
export function appendOptionCallToAction(raw: string, languageHint = ''): string {
  const options = extractQuickReplies(raw);
  if (!options.length) return raw;
  const turkish = /seçenek|sepet|kahvaltı|vejetaryen|istiyorum|bütçe|yanıt/i.test(`${raw}\n${languageHint}`);
  const numbers = options.map((option) => `'${option.id}'`);
  const choices = numbers.slice(0, -1).join(', ') + (turkish ? ' veya ' : ' or ') + numbers[numbers.length - 1];
  const cta = turkish
    ? `Bu seçeneği sepete eklemek için ${choices} yazarak yanıtlayın. Ödemeden önce sepeti inceleyin.`
    : `Reply with ${choices} to add that option to your cart. Review the cart before checkout.`;
  return raw.trimEnd().endsWith(cta) ? raw : `${raw.trimEnd()}\n\n${cta}`;
}
