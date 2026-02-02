
export type TabType = 'calculator' | 'marketplace' | 'assets';
export type UserRole = 'guest' | 'admin' | 'pro';

export interface RecipeRequirement {
  coal: number;
  ore: number;
  oreType: string;
  previousIngot?: {
    type: string;
    amount: number;
  };
  craftingTimeMinutes: number;
}

export interface IngotRecipe {
  id: string;
  name: string;
  image: string;
  requirements: RecipeRequirement;
  color: string;
}

export interface Stock {
  coal: number;
  copperOre: number;
  ironOre: number;
  silverOre: number;
  goldOre: number;
  adamantiumOre: number;
  dragonGlassOre: number;
  copperIngot: number;
  ironIngot: number;
  silverIngot: number;
  goldIngot: number;
  adamantiumIngot: number;
}

export interface MarketItemTemplate {
  id: string;
  name: string;
  icon_url: string; // Changed from iconUrl
}

export interface SaleItem {
  id: string;
  templateId: string;
  name: string;
  price: string;
  description: string;
  imageUrl: string;
  seller: string;
  isPro: boolean;
  created_at?: string;
}

export interface AssetImages {
  [key: string]: string;
}
