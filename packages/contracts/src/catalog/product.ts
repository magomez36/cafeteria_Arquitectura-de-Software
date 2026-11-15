import type { Money } from '../pricing/money.js';
export interface ProductSummary { productId: string; name: string; unitPrice: Money; available: boolean; }
