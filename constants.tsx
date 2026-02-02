
import { IngotRecipe } from './types';

export const RECIPES: IngotRecipe[] = [
  {
    id: 'copperIngot',
    name: 'Copper Ingot',
    image: 'https://images.unsplash.com/photo-1590502160462-0994f3162799?w=400&auto=format&fit=crop&q=60',
    color: 'text-orange-400',
    requirements: {
      coal: 200,
      ore: 150,
      oreType: 'Copper Ore',
      craftingTimeMinutes: 6,
    }
  },
  {
    id: 'ironIngot',
    name: 'Iron Ingot',
    image: 'https://images.unsplash.com/photo-1558500224-8147d3d2fc49?w=400&auto=format&fit=crop&q=60',
    color: 'text-slate-300',
    requirements: {
      coal: 300,
      ore: 300,
      oreType: 'Iron Ore',
      previousIngot: { type: 'copperIngot', amount: 2 },
      craftingTimeMinutes: 12,
    }
  },
  {
    id: 'silverIngot',
    name: 'Silver Ingot',
    image: 'https://images.unsplash.com/photo-1582266255765-fa5cf1a1d501?w=400&auto=format&fit=crop&q=60',
    color: 'text-zinc-400',
    requirements: {
      coal: 600,
      ore: 400,
      oreType: 'Silver Ore',
      previousIngot: { type: 'ironIngot', amount: 4 },
      craftingTimeMinutes: 30,
    }
  },
  {
    id: 'goldIngot',
    name: 'Gold Ingot',
    image: 'https://images.unsplash.com/photo-1610375461246-83df859d849d?w=400&auto=format&fit=crop&q=60',
    color: 'text-yellow-400',
    requirements: {
      coal: 1200,
      ore: 1000,
      oreType: 'Gold Ore',
      previousIngot: { type: 'silverIngot', amount: 4 },
      craftingTimeMinutes: 60,
    }
  },
  {
    id: 'adamantiumIngot',
    name: 'Adamantium Ingot',
    image: 'https://images.unsplash.com/photo-1627163439134-7a8c47e08238?w=400&auto=format&fit=crop&q=60',
    color: 'text-cyan-400',
    requirements: {
      coal: 2400,
      ore: 1500,
      oreType: 'Adamantium Ore',
      previousIngot: { type: 'goldIngot', amount: 6 },
      craftingTimeMinutes: 120,
    }
  },
  {
    id: 'dragonGlassIngot',
    name: 'Dragon Glass Ingot',
    image: 'https://images.unsplash.com/photo-1551009175-8a68da93d5f9?w=400&auto=format&fit=crop&q=60',
    color: 'text-purple-500',
    requirements: {
      coal: 4800,
      ore: 2000,
      oreType: 'Dragon Glass Ore',
      previousIngot: { type: 'adamantiumIngot', amount: 7 },
      craftingTimeMinutes: 240,
    }
  }
];
