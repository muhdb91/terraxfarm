
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
  dragonGlassIngot: number;
}

export interface MarketItemTemplate {
  id: string;
  name: string;
  icon_url: string;
}

export interface SaleItem {
  id: string;
  template_id: string;
  name: string;
  price: string;
  description: string;
  image_url: string;
  seller: string;
  seller_avatar?: string;
  is_pro: boolean;
  created_at?: string;
}

export interface AuthorizedKey {
  id: string;
  role: string;
  key_value: string;
  display_name: string;
  avatar_url: string;
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export interface AssetImages {
  [key: string]: string;
}
