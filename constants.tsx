
import { IngotRecipe } from './types';

export const RECIPES: IngotRecipe[] = [
  {
    id: 'copperIngot',
    name: 'Copper Ingot',
    image: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/copper-ingot.png',
    color: 'text-[#cd7f32]',
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
    image: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/iron-ingot.png',
    color: 'text-[#a19d94]',
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
    image: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/silver-ingot.png',
    color: 'text-[#c0c0c0]',
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
    image: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/gold-ingot.png',
    color: 'text-[#ffd700]',
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
    image: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/adamant-ingot.png',
    color: 'text-[#00ffff]',
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
    image: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/dragon-ingot.png',
    color: 'text-[#ff4500]',
    requirements: {
      coal: 4800,
      ore: 2000,
      oreType: 'Dragon Glass Ore',
      previousIngot: { type: 'adamantiumIngot', amount: 7 },
      craftingTimeMinutes: 240,
    }
  }
];
