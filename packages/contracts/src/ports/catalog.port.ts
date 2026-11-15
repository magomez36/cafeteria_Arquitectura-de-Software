import type { ProductSummary } from '../catalog/product.js';
export interface CatalogPort { getProduct(productId: string): Promise<ProductSummary | null>; }
