export interface ScheduleSlot {
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
}

export interface PublicAllergen {
  code: string;
  label: string;
}

export interface PublicProduct {
  productId: string;
  name: string;
  description: string;
  unitPrice: { amountMinor: number; currency: 'USD' };
  imageUrl: string | null;
  imageAlt: string;
  allergens: PublicAllergen[];
  availability: 'available' | 'sold_out';
  purchasable: boolean;
}

export interface PublicCategory {
  id: string;
  name: string;
  products: PublicProduct[];
}

export interface PublicMenu {
  id: string;
  name: string;
  versionNumber: number;
  availability: {
    availableNow: boolean;
    nextAvailableAt: string | null;
    schedule: ScheduleSlot[];
  };
  notice: string | null;
  categories: PublicCategory[];
}

export interface PublicMenusResponse {
  generatedAt: string;
  timezone: string;
  allergens: PublicAllergen[];
  menus: PublicMenu[];
}
