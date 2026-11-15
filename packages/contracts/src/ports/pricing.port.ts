import type { PriceQuote } from '../pricing/quote.js';
export interface PricingPort { quote(input: { productId: string; quantity: number }): Promise<PriceQuote>; }
