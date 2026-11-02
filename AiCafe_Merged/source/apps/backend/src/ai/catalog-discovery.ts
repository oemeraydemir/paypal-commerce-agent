import { CatalogService } from '../catalog/service';
import { parseBudgetMinor, parsePeople } from './fallback-planner';
import { meetsDietaryPreferences, type ShoppingPreferences } from './tool-executor';

export interface CatalogChoice { productId: string; name: string; quantity: number; totalMinor: number; }
export interface CatalogDiscovery {
  category: string;
  quantity: number;
  language: 'en' | 'tr';
  effectivePreferences: ShoppingPreferences;
  options: CatalogChoice[];
}
const catalog = new CatalogService();

function categoryFor(message: string): string | null {
  const lower = message.toLocaleLowerCase('tr-TR');
  if (/\b(breakfast|brunch)\b/i.test(message) || lower.includes('kahvaltı') || lower.includes('kahvalti')) return 'breakfast';
  if (/\blunch\b/i.test(message) || lower.includes('öğle') || lower.includes('ogle')) return 'lunch';
  if (/\b(dessert|desserts|sweet)\b/i.test(message) || lower.includes('tatlı') || lower.includes('tatli')) return 'desserts';
  if (/\bsnacks?\b/i.test(message) || lower.includes('atıştırmalık') || lower.includes('atistirmalik')) return 'snacks';
  if (/\b(drinks?|beverage)\b/i.test(message) || lower.includes('içecek') || lower.includes('icecek')) return 'drinks';
  return null;
}
function languageFor(message: string): 'en' | 'tr' {
  return /kahvaltı|kahvalti|vejetaryen|vejeteryan|seçenek|öğle|ogle|tatlı|tatli|bütçe|kişilik|kişiye|kişi/i.test(message) ? 'tr' : 'en';
}
function quantityFor(message: string): number {
  const match = /(?:^|\s)(\d{1,2}|bir|iki|üç|uc|dört|dort|beş|bes|altı|alti)\s*(?:kişi(?:lik|ye)?)(?=\s|$|[,.!?])/iu.exec(message);
  if (match) {
    const words: Record<string,number> = {bir:1,iki:2,üç:3,uc:3,dört:4,dort:4,beş:5,bes:5,altı:6,alti:6};
    const token=match[1].toLocaleLowerCase('tr-TR');
    return Math.max(1,Math.min(/^\d+$/.test(token)?Number(token):(words[token]||1),20));
  }
  return parsePeople(message);
}
function messageBudgetMinor(message: string): number | undefined {
  const parsed=parseBudgetMinor(message); if (parsed!==undefined) return parsed;
  const tr=/(?:bütçe(?:m|n|si)?|en fazla|maks(?:imum)?|altında|kadar)\s*[:=]?\s*(?:€\s*)?(\d+(?:[.,]\d{1,2})?)/iu.exec(message);
  const currency=/(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur|euro)/iu.exec(message);
  const m=tr||currency; if(!m) return undefined;
  const value=Number(m[1].replace(',','.'));
  return Number.isFinite(value)&&value>0&&value<=1000?Math.round(value*100):undefined;
}
function dietaryFor(message:string, profile:ShoppingPreferences):string[] {
  const fromMessage:string[]=[];
  if (/\bvegan\b/i.test(message)) fromMessage.push('vegan');
  else if (/\bvegetarian\b|\bveggie\b|vejetaryen|vejeteryan/i.test(message)) fromMessage.push('vegetarian');
  if (/gluten[- ]?free|glutensiz/i.test(message)) fromMessage.push('gluten-free');
  return [...new Set([...(profile.dietary||[]),...fromMessage])];
}
function explicitCartAction(message:string):boolean {
  return /\b(?:prepare|make)\s+(?:the\s+|a\s+)?cart\b|\badd\s+(?:this|that|it|these|those)?\s*\w*\s*to\s+(?:the\s+)?cart\b|\b(?:order|buy)\s+(?:this|these|the)\b|sepete\s+ekle|sepeti\s+hazırla|sipariş\s+ver|satın\s+al/i.test(message);
}
export function profileSignature(profile:ShoppingPreferences):string {
  return JSON.stringify({dietary:[...new Set(profile.dietary||[])].sort(),maxBudgetMinor:profile.maxBudgetMinor??null});
}
/** Uses only available catalog items. Prices are omitted until prepare_cart revalidates a selection. */
export function buildCatalogDiscovery(message:string,profile:ShoppingPreferences,menu:CatalogService=catalog):CatalogDiscovery|null {
  const category=categoryFor(message); if(!category||explicitCartAction(message)) return null;
  const quantity=quantityFor(message), dietary=dietaryFor(message,profile), requested=messageBudgetMinor(message);
  const budgets=[profile.maxBudgetMinor,requested].filter((v):v is number=>v!==undefined);
  const maxBudgetMinor=budgets.length?Math.min(...budgets):undefined;
  const effectivePreferences:ShoppingPreferences={dietary,...(maxBudgetMinor!==undefined?{maxBudgetMinor}:{})};
  const options=menu.search({category})
    .filter(p=>meetsDietaryPreferences(p,dietary))
    .filter(p=>maxBudgetMinor===undefined||p.priceMinor*quantity<=maxBudgetMinor)
    .slice(0,4)
    .map(p=>({productId:p.id,name:p.name,quantity,totalMinor:p.priceMinor*quantity}));
  if(options.length<2) return null;
  return {category,quantity,language:languageFor(message),effectivePreferences,options};
}
export function parseOptionSelection(message:string):number|null {
  const m=/^(?:(?:option|seçenek)\s*)?(\d{1,2})[.)]?$/iu.exec(message.trim());
  if(!m) return null; const n=Number(m[1]); return Number.isInteger(n)&&n>0?n:null;
}
export function formatDiscoveryReply(d:CatalogDiscovery):string {
  const tr=d.language==='tr';
  const intro=tr
    ? `Profilinize ve isteğinize uyan ${d.options.length} menü seçeneği buldum. Birini seçin; sepeti hazırlarken bütçe ve satın alma politikası yeniden kontrol edilecek.`
    : `I found ${d.options.length} menu options that match your request and shopper profile. Choose one; I will re-check the budget and purchase policy when preparing the cart.`;
  const rows=d.options.map((o,i)=>`${i+1}. ${o.quantity>1?`${o.quantity}× `:''}${o.name}`);
  return `${intro}\n\n${tr?'Seçenekler:':'Options:'}\n${rows.join('\n')}`;
}
