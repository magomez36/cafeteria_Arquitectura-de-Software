import type { Money } from './money.js';
export interface PriceQuote { productId: string; quantity: number; unitPrice: Money; subtotal: Money; discount: Money; total: Money; calculatedAt: string; }
