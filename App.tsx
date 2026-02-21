import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from 'https://esm.sh/@supabase/supabase-js';
import { RECIPES } from './constants';
import { TabType, Stock, SaleItem, AssetImages, IngotRecipe, UserRole, MarketItemTemplate, AuthorizedKey, Notification, Rarity } from './types';

// --- SUPABASE CONFIGURATION ---
const SUPABASE_URL = 'https://your-project-url.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const RARITY_COLORS: Record<Rarity, string> = {
  common: '#5d4037',
  uncommon: '#4ade80',
  rare: '#60a5fa',
  epic: '#c084fc',
  legendary: '#fb923c',
};

const getRarityBorder = (rarity?: Rarity) => {
  if (!rarity || rarity === 'common') return 'border-[#5d4037]';
  return `border-[${RARITY_COLORS[rarity]}]`;
};

const getRarityShadow = (rarity?: Rarity) => {
  if (!rarity || rarity === 'common') return '';
  return `shadow-[0_0_15px_${RARITY_COLORS[rarity]}44]`;
};

const PRESET_AVATARS = [
  'https://api.dicebear.com/7.x/bottts/svg?seed=TerraX-1',
  'https://api.dicebear.com/7.x/bottts/svg?seed=TerraX-2',
];

const ORE_ICONS: { [key: string]: string } = {
  'Coal': '🌑',
  'Copper Ore': '🧱',
  'Iron Ore': '⛓️',
  'Silver Ore': '🪙',
  'Gold Ore': '👑',
  'Adamantium Ore': '💎',
  'Dragon Glass Ore': '🔮',
};

const calculateMaxIngots = (recipeId: string, stock: Stock): number => {
  const recipe = RECIPES.find(r => r.id === recipeId);
  if (!recipe) return 0;
  const oreMapping: Record<string, keyof Stock> = {
    'Coal': 'coal', 'Copper Ore': 'copperOre', 'Iron Ore': 'ironOre', 'Silver Ore': 'silverOre',
    'Gold Ore': 'goldOre', 'Adamantium Ore': 'adamantiumOre', 'Dragon Glass Ore': 'dragonGlassOre'
  };
  const limits: number[] = [];
  if (recipe.requirements.coal > 0) limits.push(Math.floor(stock.coal / recipe.requirements.coal));
  const oreKey = oreMapping[recipe.requirements.oreType];
  if (oreKey && recipe.requirements.ore > 0) limits.push(Math.floor(stock[oreKey] / recipe.requirements.ore));
  if (recipe.requirements.previousIngot) {
    const prevKey = recipe.requirements.previousIngot.type as keyof Stock;
    if (stock[prevKey] !== undefined) limits.push(Math.floor(stock[prevKey] / recipe.requirements.previousIngot.amount));
  }
  return limits.length > 0 ? Math.min(...limits) : 0;
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('calculator');
  const [userRole, setUserRole] = useState<UserRole>('guest');
  const [currentUser, setCurrentUser] = useState<AuthorizedKey | null>(null);
  
  const [loginInput, setLoginInput] = useState({ handle: '', key: '' });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginType, setLoginType] = useState<'admin' | 'pro'>('admin');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const [itemDatabase, setItemDatabase] = useState<MarketItemTemplate[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [cloudSkins, setCloudSkins] = useState<AssetImages>({});
  const [cloudRarities, setCloudRarities] = useState<Record<string, Rarity>>({});
  const [oreSkins, setOreSkins] = useState<AssetImages>({});
  const [userRegistry, setUserRegistry] = useState<AuthorizedKey[]>([]);
  const [visitorCount, setVisitorCount] = useState<number | null>(null);

  const [stock, setStock] = useState<Stock>(() => {
    const saved = localStorage.getItem('terrax_stock');
    return saved ? JSON.parse(saved) : {
      coal: 0, copperOre: 0, ironOre: 0, silverOre: 0, goldOre: 0, adamantiumOre: 0, dragonGlassOre: 0,
      copperIngot: 0, ironIngot: 0, silverIngot: 0, goldIngot: 0, adamantiumIngot: 0, dragonGlassIngot: 0,
    };
  });

  const [newListing, setNewListing] = useState({ templateId: '', price: '', description: '', searchQuery: '' });
  const [adminNewUser, setAdminNewUser] = useState({ role: 'pro', key_value: '' });
  const [adminNewTemplate, setAdminNewTemplate] = useState({ name: '', icon_url: '', rarity: 'common' as Rarity });
  const [adminNewAsset, setAdminNewAsset] = useState({ type: 'ingot' as 'ingot' | 'ore', targetId: '', icon_url: '', rarity: 'common' as Rarity });

  // Fix: Defined filteredDatabase to handle item registry searching in the Marketplace tab.
  const filteredDatabase = useMemo(() => {
    if (!newListing.searchQuery) return [];
    const query = newListing.searchQuery.toLowerCase();
    return itemDatabase.filter(item => item.name.toLowerCase().includes(query));
  }, [itemDatabase, newListing.searchQuery]);

  const notify = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4500);
  };

  const fetchGlobalData = async () => {
    setIsSyncing(true);
    try {
      const { data: templates } = await supabase.from('market_templates').select('*').order('name');
      const { data: ads } = await supabase.from('sale_listings').select('*').order('created_at', { ascending: false });
      const { data: skins } = await supabase.from('forge_skins').select('*');
      const { data: ores } = await supabase.from('ore_skins').select('*');
      if (templates) setItemDatabase(templates);
      if (ads) setSaleItems(ads);
      if (skins) {
          const skinMap: AssetImages = {};
          const rarityMap: Record<string, Rarity> = {};
          skins.forEach(s => {
            skinMap[s.recipe_id] = s.image_url;
            if (s.rarity) rarityMap[s.recipe_id] = s.rarity;
          });
          setCloudSkins(skinMap);
          setCloudRarities(rarityMap);
      }
      if (ores) {
          const oreMap: AssetImages = {};
          ores.forEach(o => oreMap[o.ore_name] = o.image_url);
          setOreSkins(oreMap);
      }
      if (userRole === 'admin') {
        const { data: users } = await supabase.from('authorized_keys').select('*').order('role');
        if (users) setUserRegistry(users);
      }
    } catch (e) { console.error(e); } finally { setIsSyncing(false); }
  };

  useEffect(() => { fetchGlobalData(); }, [userRole]);
  useEffect(() => { localStorage.setItem('terrax_stock', JSON.stringify(stock)); }, [stock]);

  useEffect(() => {
    const handleVisitors = async () => {
      try {
        const { data, error } = await supabase.from('app_stats').select('count').eq('id', 'visitors').single();
        if (data) {
          const newCount = data.count + 1;
          setVisitorCount(newCount);
          await supabase.from('app_stats').update({ count: newCount }).eq('id', 'visitors');
        } else {
          await supabase.from('app_stats').insert([{ id: 'visitors', count: 1 }]);
          setVisitorCount(1);
        }
      } catch (e) {
        const local = parseInt(localStorage.getItem('terrax_visitors') || '742') + 1;
        localStorage.setItem('terrax_visitors', local.toString());
        setVisitorCount(local);
      }
    };
    handleVisitors();
  }, []);

  const getUserDisplayName = (user: AuthorizedKey | null) => {
    if (!user) return 'Guest';
    if (user.display_name) return user.display_name;
    return `PILOT-${user.id.substring(0, 8)}`;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const handle = loginInput.handle.trim(); // This is the UUID in user's DB
    const key = loginInput.key.trim();
    if (!handle || !key) return;
    setIsVerifying(true);

    try {
      const { data, error } = await supabase
        .from('authorized_keys')
        .select('*')
        .eq('role', loginType)
        .eq('id', handle) // Map Handle ID input to the 'id' column
        .eq('key_value', key)
        .single();

      if (error || !data) {
        notify("Access Denied: Check your UUID (id) and Role.", "error");
      } else {
        setUserRole(loginType);
        setCurrentUser(data);
        notify(`Welcome back, ${getUserDisplayName(data)}!`, "success");
        setShowLoginModal(false);
        setLoginInput({ handle: '', key: '' });
      }
    } catch (err) { notify("Sync Timeout.", "error"); } finally { setIsVerifying(false); }
  };

  const handleListingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const template = itemDatabase.find(t => t.id === newListing.templateId);
    if (!template || !newListing.price) return;
    setIsSyncing(true);
    const { error } = await supabase.from('sale_listings').insert([{
      template_id: template.id, name: template.name, price: newListing.price, description: newListing.description,
      image_url: template.icon_url, seller: getUserDisplayName(currentUser), is_pro: userRole === 'pro',
      rarity: template.rarity || 'common'
    }]);
    if (!error) {
      setNewListing({ templateId: '', price: '', description: '', searchQuery: '' });
      notify("Listing published to cloud.", "success");
      fetchGlobalData();
    } else notify("Market Error: " + error.message, "error");
    setIsSyncing(false);
  };

  const handleDeleteAd = async (id: string) => {
    setIsSyncing(true);
    await supabase.from('sale_listings').delete().eq('id', id);
    notify("Listing terminated.", "info");
    fetchGlobalData();
    setIsSyncing(false);
  };

  const handleStockChange = (field: keyof Stock, val: string) => {
    const num = parseInt(val) || 0;
    setStock(prev => ({ ...prev, [field]: num }));
  };

  const handleAdminCreateUser = async (e: React.FormEvent) => {
    if (!adminNewUser.key_value) {
      notify("Key Value is required.", "error");
      return;
    }
    setIsSyncing(true);
    const { error } = await supabase.from('authorized_keys').insert([{
      role: adminNewUser.role,
      key_value: adminNewUser.key_value
    }]);
    if (!error) {
      setAdminNewUser({ role: 'pro', key_value: '' });
      notify("New identity authorized. UUID generated.", "success");
      fetchGlobalData();
    } else notify("Registry Sync Failed: " + error.message, "error");
    setIsSyncing(false);
  };

  const handleAdminDeleteUser = async (id: string) => {
    if (id === currentUser?.id) {
      notify("Access Violation: Cannot revoke root terminal access for self.", "error");
      return;
    }
    setIsSyncing(true);
    const { error } = await supabase.from('authorized_keys').delete().eq('id', id);
    if (!error) {
      notify("Identity access revoked.", "info");
      fetchGlobalData();
    } else notify("Registry Purge Failed: " + error.message, "error");
    setIsSyncing(false);
  };

  const handleLocalImageUpload = (e: React.ChangeEvent<HTMLInputElement>, callback: (url: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 1024 * 1024) { // 1MB limit for base64 in DB
        notify("Artifact too heavy (Max 1MB).", "error");
        return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      callback(reader.result as string);
      notify("Artifact image inscribed.", "success");
    };
    reader.readAsDataURL(file);
  };

  const handleAdminCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminNewTemplate.name || !adminNewTemplate.icon_url) {
      notify("Name and Icon URL are required.", "error");
      return;
    }
    setIsSyncing(true);
    const { error } = await supabase.from('market_templates').insert([adminNewTemplate]);
    if (!error) {
      setAdminNewTemplate({ name: '', icon_url: '', rarity: 'common' });
      notify("Market template added to registry.", "success");
      fetchGlobalData();
    } else notify("Template Sync Failed: " + error.message, "error");
    setIsSyncing(false);
  };

  const handleAdminCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminNewAsset.targetId || !adminNewAsset.icon_url) {
      notify("Target ID and Icon URL are required.", "error");
      return;
    }
    setIsSyncing(true);
    let error;
    if (adminNewAsset.type === 'ingot') {
      const { error: e1 } = await supabase.from('forge_skins').upsert([{
        recipe_id: adminNewAsset.targetId,
        image_url: adminNewAsset.icon_url,
        rarity: adminNewAsset.rarity
      }]);
      error = e1;
    } else {
      const { error: e2 } = await supabase.from('ore_skins').upsert([{
        ore_name: adminNewAsset.targetId,
        image_url: adminNewAsset.icon_url
      }]);
      error = e2;
    }
    
    if (!error) {
      setAdminNewAsset({ ...adminNewAsset, icon_url: '' });
      notify("Asset inscribed to registry.", "success");
      fetchGlobalData();
    } else notify("Asset Sync Failed: " + error.message, "error");
    setIsSyncing(false);
  };

  const handleAdminDeleteAsset = async (type: 'ingot' | 'ore', id: string) => {
    setIsSyncing(true);
    const table = type === 'ingot' ? 'forge_skins' : 'ore_skins';
    const column = type === 'ingot' ? 'recipe_id' : 'ore_name';
    const { error } = await supabase.from(table).delete().eq(column, id);
    if (!error) {
      notify("Asset purged from registry.", "info");
      fetchGlobalData();
    } else notify("Asset Purge Failed: " + error.message, "error");
    setIsSyncing(false);
  };

  const handleAdminDeleteTemplate = async (id: string) => {
    setIsSyncing(true);
    const { error } = await supabase.from('market_templates').delete().eq('id', id);
    if (!error) {
      notify("Template removed from registry.", "info");
      fetchGlobalData();
    } else notify("Template Purge Failed: " + error.message, "error");
    setIsSyncing(false);
  };

  return (
    <div className="h-screen overflow-hidden bg-[#1a0f0a] text-[#d4c4a8] p-2 md:p-4 font-serif-fantasy selection:bg-[#4a3728] selection:text-white flex flex-col">
      <div className="fixed top-4 right-4 z-[200] space-y-2 pointer-events-none">
        {notifications.map(n => (
          <div key={n.id} className={`px-4 py-3 border-4 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-right-10 flex items-center space-x-3 pointer-events-auto min-w-[280px] ${
            n.type === 'success' ? 'bg-[#1a2416] border-green-700/50 text-green-200' :
            n.type === 'error' ? 'bg-red-900/40 border-red-700/50 text-red-200' : 'bg-[#2b1d16] border-[#5d4037] text-amber-200'
          }`}>
            <div className={`w-2 h-2 rounded-full ${n.type === 'success' ? 'bg-green-500 shadow-[0_0_10px_green]' : n.type === 'error' ? 'bg-red-500 shadow-[0_0_10px_red]' : 'bg-amber-500 shadow-[0_0_10px_amber]'}`}></div>
            <p className="text-xs font-medieval tracking-widest uppercase">{n.message}</p>
          </div>
        ))}
      </div>

      <header className="max-w-6xl mx-auto mb-4 text-center relative pt-4 w-full flex-shrink-0">
        <div className="absolute top-0 left-0 text-2xl opacity-30 pointer-events-none">⚔️</div>
        <div className="absolute top-0 right-0 text-2xl opacity-30 pointer-events-none">🛡️</div>
        <div className="absolute top-0 right-0">
            <button onClick={fetchGlobalData} className="text-[8px] font-retro font-bold text-amber-500 uppercase tracking-widest bg-[#3e2723] px-3 py-1.5 border-2 border-[#8d6e63] transition-all hover:bg-[#5d4037] hover:border-amber-500 shadow-lg">
                {isSyncing ? 'COMMUNING...' : 'REFRESH'}
            </button>
        </div>
        <h1 className="text-4xl md:text-5xl font-medieval font-bold tracking-tighter bg-gradient-to-b from-[#d4af37] via-[#b8860b] to-[#8b4513] bg-clip-text text-transparent mb-2 drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] animate-flicker">TERRAX FORGE</h1>
        <div className="flex justify-center items-center space-x-4 text-[#d4c4a8] text-[10px] font-bold tracking-[0.3em] uppercase font-retro">
          <span className="flex items-center"><span className="mr-1">⚒️</span> SMITHY</span>
          <span className="w-1 h-1 bg-[#d4af37]"></span>
          <span className="flex items-center">MARKET <span className="ml-1">📜</span></span>
          {userRole !== 'guest' && (
            <>
              <span className="w-1 h-1 bg-[#d4af37]"></span>
              <span className={`${userRole === 'admin' ? 'text-amber-500' : 'text-purple-400'} font-bold flex items-center`}>
                <span className="mr-1">🗝️</span> {getUserDisplayName(currentUser)}
              </span>
            </>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto mb-4 flex justify-center space-x-2 flex-shrink-0">
        <TabButton active={activeTab === 'calculator'} onClick={() => setActiveTab('calculator')} label="Forge" color="cyan" />
        <TabButton active={activeTab === 'marketplace'} onClick={() => setActiveTab('marketplace')} label="Market" color="purple" />
        {userRole === 'admin' && <TabButton active={activeTab === 'assets'} onClick={() => setActiveTab('assets')} label="Admin" color="amber" />}
      </div>

      <main className="max-w-6xl mx-auto flex-1 overflow-y-auto w-full pr-2 custom-scrollbar">
        {activeTab === 'calculator' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-6 duration-700 pb-4">
            <div className="lg:col-span-1 bg-[#2b1d16] p-4 border-4 border-[#5d4037] shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] relative overflow-hidden">
              <div className="absolute -top-6 -right-6 text-4xl opacity-10 pointer-events-none">📜</div>
              <h2 className="text-lg font-medieval font-bold mb-4 tracking-widest text-[#d4af37] flex items-center">
                <span className="mr-2 text-[#b8860b] text-xl">📦</span> STOREHOUSE
              </h2>
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3">
                  <StockInput label="Coal" value={stock.coal} onChange={(v) => handleStockChange('coal', v)} icon={ORE_ICONS['Coal']} />
                  <div className="grid grid-cols-2 gap-3">
                    <StockInput label="Copper Ore" value={stock.copperOre} onChange={(v) => handleStockChange('copperOre', v)} icon={oreSkins['Copper Ore'] || ORE_ICONS['Copper Ore']} isImage={!!oreSkins['Copper Ore']} />
                    <StockInput label="Iron Ore" value={stock.ironOre} onChange={(v) => handleStockChange('ironOre', v)} icon={oreSkins['Iron Ore'] || ORE_ICONS['Iron Ore']} isImage={!!oreSkins['Iron Ore']} />
                    <StockInput label="Silver Ore" value={stock.silverOre} onChange={(v) => handleStockChange('silverOre', v)} icon={oreSkins['Silver Ore'] || ORE_ICONS['Silver Ore']} isImage={!!oreSkins['Silver Ore']} />
                    <StockInput label="Gold Ore" value={stock.goldOre} onChange={(v) => handleStockChange('goldOre', v)} icon={oreSkins['Gold Ore'] || ORE_ICONS['Gold Ore']} isImage={!!oreSkins['Gold Ore']} />
                    <StockInput label="Adamant Ore" value={stock.adamantiumOre} onChange={(v) => handleStockChange('adamantiumOre', v)} icon={oreSkins['Adamantium Ore'] || ORE_ICONS['Adamantium Ore']} isImage={!!oreSkins['Adamantium Ore']} />
                    <StockInput label="Dragon Ore" value={stock.dragonGlassOre} onChange={(v) => handleStockChange('dragonGlassOre', v)} icon={oreSkins['Dragon Glass Ore'] || ORE_ICONS['Dragon Glass Ore']} isImage={!!oreSkins['Dragon Glass Ore']} />
                  </div>
                </div>
                <div className="h-1 bg-[#5d4037] my-4" />
                <div className="grid grid-cols-2 gap-3">
                  <StockInput label="Copper" value={stock.copperIngot} onChange={(v) => handleStockChange('copperIngot', v)} icon="🧱" />
                  <StockInput label="Iron" value={stock.ironIngot} onChange={(v) => handleStockChange('ironIngot', v)} icon="⚔️" />
                  <StockInput label="Silver" value={stock.silverIngot} onChange={(v) => handleStockChange('silverIngot', v)} icon="🪙" />
                  <StockInput label="Gold" value={stock.goldIngot} onChange={(v) => handleStockChange('goldIngot', v)} icon="👑" />
                  <StockInput label="Adamant" value={stock.adamantiumIngot} onChange={(v) => handleStockChange('adamantiumIngot', v)} icon="💎" />
                  <StockInput label="Dragon" value={stock.dragonGlassIngot} onChange={(v) => handleStockChange('dragonGlassIngot', v)} icon="🔮" />
                </div>
              </div>
            </div>

            <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {RECIPES.map((recipe) => {
                const max = calculateMaxIngots(recipe.id, stock);
                const rarity = cloudRarities[recipe.id];
                return (
                  <div key={recipe.id} className={`group bg-[#3e2723]/80 border-4 ${getRarityBorder(rarity)} overflow-hidden hover:border-[#d4af37] transition-all duration-300 shadow-xl relative ${getRarityShadow(rarity)}`}>
                    <div className="absolute top-1 right-1 text-sm opacity-20 group-hover:opacity-40 transition-opacity">⚒️</div>
                    <div className="p-4">
                      <div className="flex items-center space-x-4 mb-4">
                        <div className={`w-[60px] h-[60px] bg-[#1a0f0a] border-2 ${getRarityBorder(rarity)} shadow-xl group-hover:scale-105 transition-transform overflow-hidden relative`}>
                          <div className="absolute inset-0 bg-gradient-to-tr from-amber-900/20 to-transparent"></div>
                          <img src={cloudSkins[recipe.id] || recipe.image} alt={recipe.name} className="w-full h-full object-cover relative z-10" />
                        </div>
                        <div>
                          <h3 className={`text-lg font-medieval font-bold ${recipe.color} tracking-tight drop-shadow-sm`}>{recipe.name}</h3>
                          <div className="text-[10px] text-[#d4c4a8] uppercase font-bold flex items-center tracking-widest mt-1 font-retro">
                            {recipe.requirements.oreType} 
                            <span className="ml-1">
                              {oreSkins[recipe.requirements.oreType] ? (
                                <img src={oreSkins[recipe.requirements.oreType]} className="w-3 h-3 object-contain inline-block" alt="ore" />
                              ) : (
                                ORE_ICONS[recipe.requirements.oreType]
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-4 text-center uppercase tracking-widest font-bold text-[8px] font-retro">
                         <div className="bg-[#1a0f0a] p-2 border border-[#5d4037] shadow-inner">
                            <div className="text-[#8d6e63] mb-0.5">Fuel</div>
                            <div className="text-xs font-retro text-[#d4af37]">{(recipe.requirements.coal * (max || 1)).toLocaleString()}</div>
                         </div>
                         <div className="bg-[#1a0f0a] p-2 border border-[#5d4037] shadow-inner">
                            <div className="text-[#8d6e63] mb-0.5">Ore</div>
                            <div className="text-xs font-retro text-[#d4af37]">{(recipe.requirements.ore * (max || 1)).toLocaleString()}</div>
                         </div>
                      </div>
                      <div className="bg-[#2b1d16] p-4 border-2 border-[#5d4037] text-center relative overflow-hidden group-hover:border-[#d4af37] transition-all">
                        <div className="absolute -bottom-2 -left-2 text-2xl opacity-10">🛡️</div>
                        <span className="block text-[9px] uppercase tracking-[0.3em] text-[#8d6e63] mb-1 font-bold font-retro">Forge Yield</span>
                        <span className={`text-4xl font-retro font-bold ${max > 0 ? 'text-[#d4af37] drop-shadow-[0_0_10px_rgba(212,175,55,0.8)]' : 'text-[#3e2723]'}`}>{max.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'marketplace' && (
          <div className="space-y-8 animate-in fade-in duration-700 pb-4">
            {(userRole === 'admin' || userRole === 'pro') && (
              <div className={`bg-[#2b1d16] border-4 ${userRole === 'admin' ? 'border-amber-500/40 shadow-amber-900/20' : 'border-purple-500/40 shadow-purple-900/20'} p-6 rounded-none backdrop-blur-sm shadow-2xl relative overflow-hidden`}>
                <h2 className="text-xl font-medieval font-bold mb-6 flex items-center relative text-white"><span className={`mr-3 p-2 ${userRole === 'admin' ? 'bg-amber-500/20 text-amber-400' : 'bg-purple-500/20 text-purple-400'} rounded-none border-2 border-current shadow-2xl`}>📜</span> SCROLL OF TRADE</h2>
                <form onSubmit={handleListingSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[8px] font-bold text-[#8d6e63] uppercase tracking-widest mb-1.5 ml-1 font-retro">Registry Search</label>
                      <div className="relative">
                          <input type="text" placeholder="Search the ledger..." className="w-full bg-[#1a0f0a] border-2 border-[#5d4037] px-4 py-3 focus:outline-none focus:border-amber-500 transition-all text-xs font-bold text-[#d4af37]" value={newListing.searchQuery} onChange={(e) => setNewListing({...newListing, searchQuery: e.target.value})} />
                          {newListing.searchQuery && (
                              <div className="absolute top-full left-0 right-0 bg-[#2b1d16] border-2 border-[#5d4037] mt-2 z-50 max-h-48 overflow-y-auto shadow-2xl p-2 space-y-1">
                                  {filteredDatabase.map(item => (
                                      <button key={item.id} type="button" onClick={() => setNewListing({...newListing, templateId: item.id, searchQuery: item.name})} className="w-full flex items-center space-x-3 p-2 hover:bg-[#1a0f0a] transition-colors text-left group">
                                          <img src={item.icon_url} className="w-8 h-8 object-contain bg-[#1a0f0a] border border-[#5d4037]" alt="icon" />
                                          <span className="text-xs font-bold group-hover:text-amber-500 transition-colors text-[#d4c4a8]">{item.name}</span>
                                      </button>
                                  ))}
                              </div>
                          )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[8px] font-bold text-[#8d6e63] uppercase tracking-widest mb-1.5 ml-1 font-retro">Asking Price</label>
                      <input type="text" placeholder="e.g. 100 Gold Coins" className="w-full bg-[#1a0f0a] border-2 border-[#5d4037] px-4 py-3 focus:outline-none focus:border-amber-500 transition-all text-xs font-bold text-[#d4af37]" value={newListing.price} onChange={(e) => setNewListing({...newListing, price: e.target.value})} />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[8px] font-bold text-[#8d6e63] uppercase tracking-widest mb-1.5 ml-1 font-retro">Description</label>
                      <textarea placeholder="Write your terms..." className="w-full bg-[#1a0f0a] border-2 border-[#5d4037] px-4 py-3 h-[90px] focus:outline-none focus:border-amber-500 transition-all text-xs resize-none font-medium text-[#d4c4a8]" value={newListing.description} onChange={(e) => setNewListing({...newListing, description: e.target.value})}></textarea>
                    </div>
                    <button type="submit" disabled={isSyncing} className={`w-full py-3 border-2 border-current font-medieval font-extrabold tracking-widest text-[10px] transition-all shadow-2xl ${userRole === 'admin' ? 'bg-amber-900/40 text-amber-500 hover:bg-amber-800/60' : 'bg-purple-900/40 text-purple-400 hover:bg-purple-800/60'} disabled:opacity-50 uppercase`}>
                      {isSyncing ? 'SEALING...' : 'POST TO BOARD'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {saleItems.map(item => (
                <div key={item.id} className={`group bg-[#2b1d16] border-4 ${getRarityBorder(item.rarity)} overflow-hidden hover:border-amber-500/50 transition-all flex flex-col hover:shadow-2xl ${getRarityShadow(item.rarity)}`}>
                  <div className="p-6 flex items-start space-x-4">
                    <div className={`w-[50px] h-[50px] bg-[#1a0f0a] border-2 ${getRarityBorder(item.rarity)} flex items-center justify-center shadow-xl flex-shrink-0 overflow-hidden`}><img src={item.image_url} alt={item.name} className="w-full h-full object-cover" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <h3 className="text-lg font-medieval font-bold truncate text-[#d4c4a8] tracking-tight">{item.name}</h3>
                        {item.is_pro && <div className="w-2 h-2 bg-purple-500 shadow-[0_0_8px_purple] mt-1.5 animate-pulse"></div>}
                      </div>
                      <div className="text-amber-500 font-retro font-bold text-base mt-1 tracking-tighter">
                        {(item.price || '').replace(/\d+/g, (n) => parseInt(n).toLocaleString())}
                      </div>
                    </div>
                  </div>
                  <div className="px-6 pb-6 pt-1 flex-1"><div className="bg-[#1a0f0a] p-4 border border-[#5d4037] h-full text-[#8d6e63] text-[10px] italic leading-relaxed line-clamp-3">"{item.description || 'Verified Trade Signal'}"</div></div>
                  <div className="bg-[#1a0f0a] px-6 py-3 border-t border-[#5d4037] flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="text-[8px] font-bold text-[#8d6e63] truncate max-w-[120px] uppercase tracking-widest font-retro">{item.seller}</span>
                    </div>
                    {(userRole === 'admin' || (userRole === 'pro' && item.seller === getUserDisplayName(currentUser))) && (
                        <button onClick={() => handleDeleteAd(item.id)} className="text-[8px] font-bold text-red-500/70 hover:text-red-500 transition-colors uppercase tracking-[0.2em] font-retro">Revoke</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'assets' && userRole === 'admin' && (
          <div className="space-y-8 pb-8 animate-in fade-in duration-700">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Identity Registry */}
              <div className="bg-[#2b1d16] border-4 border-[#5d4037] p-6 shadow-2xl">
                <h2 className="text-xl font-medieval font-bold mb-6 text-amber-500 uppercase tracking-tighter">Master Registry</h2>
                <form onSubmit={(e) => { e.preventDefault(); handleAdminCreateUser(e); }} className="grid grid-cols-1 gap-4 bg-[#1a0f0a] p-4 mb-6 border-2 border-[#5d4037]">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2"><label className="text-[8px] font-bold text-[#8d6e63] uppercase tracking-[0.2em] ml-1 font-retro">Clearance</label>
                        <select className="w-full bg-[#1a0f0a] border-2 border-[#5d4037] px-4 py-2.5 focus:border-amber-500 outline-none text-xs font-bold text-[#d4c4a8] appearance-none" value={adminNewUser.role} onChange={(e) => setAdminNewUser({...adminNewUser, role: e.target.value})}><option value="pro">Pro Traveler</option><option value="admin">Root Admin</option></select>
                      </div>
                      <div className="space-y-2"><label className="text-[8px] font-bold text-[#8d6e63] uppercase tracking-[0.2em] ml-1 font-retro">Key Code</label>
                        <input type="text" placeholder="Access Code..." className="w-full bg-[#1a0f0a] border-2 border-[#5d4037] px-4 py-2.5 focus:border-amber-500 outline-none text-xs font-retro text-amber-500" value={adminNewUser.key_value} onChange={(e) => setAdminNewUser({...adminNewUser, key_value: e.target.value})} />
                      </div>
                    </div>
                    <button type="submit" disabled={isSyncing} className="w-full bg-amber-900/40 hover:bg-amber-800/60 text-amber-500 border-2 border-amber-500 font-medieval font-extrabold py-3 transition-all uppercase tracking-[0.2em] text-[10px] disabled:opacity-50 shadow-xl">GRANT ACCESS</button>
                </form>
                <div className="grid grid-cols-1 gap-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                  {userRegistry.map(user => (
                    <div key={user.id} className="bg-[#1a0f0a] p-3 border border-[#5d4037] flex items-center space-x-3 group relative shadow-inner">
                      <div className="flex-1 min-w-0">
                          <div className="text-[8px] font-retro text-amber-600 font-bold uppercase mb-0.5">{user.id}</div>
                          <div className="text-xs font-bold truncate text-[#d4c4a8] uppercase tracking-widest font-retro">{getUserDisplayName(user)}</div>
                          <div className="text-[8px] font-retro text-[#8d6e63] uppercase tracking-widest mt-0.5">{user.role} • {user.key_value}</div>
                      </div>
                      <button onClick={() => handleAdminDeleteUser(user.id)} className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-red-500/10 rounded font-bold text-[8px] uppercase font-retro">Revoke</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Market Template Registry */}
              <div className="bg-[#2b1d16] border-4 border-[#5d4037] p-6 shadow-2xl">
                <h2 className="text-xl font-medieval font-bold mb-6 text-emerald-500 uppercase tracking-tighter">Item Registry</h2>
                <form onSubmit={handleAdminCreateTemplate} className="grid grid-cols-1 gap-4 bg-[#1a0f0a] p-4 mb-6 border-2 border-[#5d4037]">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2"><label className="text-[8px] font-bold text-[#8d6e63] uppercase tracking-[0.2em] ml-1 font-retro">Item Name</label>
                        <input type="text" placeholder="Excalibur..." className="w-full bg-[#1a0f0a] border-2 border-[#5d4037] px-4 py-2.5 focus:border-amber-500 outline-none text-xs font-bold text-[#d4c4a8]" value={adminNewTemplate.name} onChange={(e) => setAdminNewTemplate({...adminNewTemplate, name: e.target.value})} />
                      </div>
                      <div className="space-y-2"><label className="text-[8px] font-bold text-[#8d6e63] uppercase tracking-[0.2em] ml-1 font-retro">Rarity</label>
                        <select className="w-full bg-[#1a0f0a] border-2 border-[#5d4037] px-4 py-2.5 focus:border-amber-500 outline-none text-xs font-bold text-[#d4c4a8] appearance-none" value={adminNewTemplate.rarity} onChange={(e) => setAdminNewTemplate({...adminNewTemplate, rarity: e.target.value as Rarity})}>
                          <option value="common">Common</option>
                          <option value="uncommon">Uncommon</option>
                          <option value="rare">Rare</option>
                          <option value="epic">Epic</option>
                          <option value="legendary">Legendary</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-2"><label className="text-[8px] font-bold text-[#8d6e63] uppercase tracking-[0.2em] ml-1 font-retro">Icon Source</label>
                      <div className="flex space-x-2">
                        <input type="text" placeholder="https://..." className="flex-1 bg-[#1a0f0a] border-2 border-[#5d4037] px-4 py-2.5 focus:border-amber-500 outline-none text-xs font-retro text-emerald-500" value={adminNewTemplate.icon_url} onChange={(e) => setAdminNewTemplate({...adminNewTemplate, icon_url: e.target.value})} />
                        <label className="cursor-pointer bg-[#3e2723] border-2 border-[#8d6e63] px-4 py-2.5 text-[10px] font-bold text-amber-500 hover:bg-[#5d4037] transition-all flex items-center justify-center font-retro shadow-lg">
                          UPLOAD
                          <input type="file" className="hidden" accept="image/*,image/webp" onChange={(e) => handleLocalImageUpload(e, (url) => setAdminNewTemplate({...adminNewTemplate, icon_url: url}))} />
                        </label>
                      </div>
                    </div>
                    <button type="submit" disabled={isSyncing} className="w-full bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-500 border-2 border-emerald-500 font-medieval font-extrabold py-3 transition-all uppercase tracking-[0.2em] text-[10px] disabled:opacity-50 shadow-xl">REGISTER ITEM</button>
                </form>
                <div className="grid grid-cols-1 gap-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                  {itemDatabase.map(item => (
                    <div key={item.id} className={`bg-[#1a0f0a] p-3 border ${getRarityBorder(item.rarity)} flex items-center space-x-3 group relative shadow-inner`}>
                      <img src={item.icon_url} className={`w-8 h-8 object-contain bg-[#1a0f0a] border ${getRarityBorder(item.rarity)}`} alt="icon" />
                      <div className="flex-1 min-w-0">
                          <div className={`text-xs font-bold truncate ${item.rarity ? `text-[${RARITY_COLORS[item.rarity]}]` : 'text-[#d4c4a8]'} uppercase tracking-widest font-retro`}>{item.name}</div>
                          <div className="text-[8px] font-retro text-[#8d6e63] truncate">{item.id}</div>
                      </div>
                      <button onClick={() => handleAdminDeleteTemplate(item.id)} className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-red-500/10 rounded font-bold text-[8px] uppercase font-retro">Purge</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Asset Registry (Ores & Ingots) */}
              <div className="bg-[#2b1d16] border-4 border-[#5d4037] p-6 shadow-2xl lg:col-span-2">
                <h2 className="text-xl font-medieval font-bold mb-6 text-blue-500 uppercase tracking-tighter">Asset Registry (Ores & Ingots)</h2>
                <form onSubmit={handleAdminCreateAsset} className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-[#1a0f0a] p-6 mb-6 border-2 border-[#5d4037]">
                    <div className="space-y-4">
                      <div className="space-y-2"><label className="text-[8px] font-bold text-[#8d6e63] uppercase tracking-[0.2em] ml-1 font-retro">Asset Type</label>
                        <select className="w-full bg-[#1a0f0a] border-2 border-[#5d4037] px-4 py-2.5 focus:border-amber-500 outline-none text-xs font-bold text-[#d4c4a8] appearance-none" value={adminNewAsset.type} onChange={(e) => setAdminNewAsset({...adminNewAsset, type: e.target.value as 'ingot' | 'ore'})}>
                          <option value="ingot">Ingot Skin</option>
                          <option value="ore">Ore Icon</option>
                        </select>
                      </div>
                      <div className="space-y-2"><label className="text-[8px] font-bold text-[#8d6e63] uppercase tracking-[0.2em] ml-1 font-retro">Target ID / Name</label>
                        {adminNewAsset.type === 'ingot' ? (
                          <select className="w-full bg-[#1a0f0a] border-2 border-[#5d4037] px-4 py-2.5 focus:border-amber-500 outline-none text-xs font-bold text-[#d4c4a8] appearance-none" value={adminNewAsset.targetId} onChange={(e) => setAdminNewAsset({...adminNewAsset, targetId: e.target.value})}>
                            <option value="">Select Ingot...</option>
                            {RECIPES.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                        ) : (
                          <select className="w-full bg-[#1a0f0a] border-2 border-[#5d4037] px-4 py-2.5 focus:border-amber-500 outline-none text-xs font-bold text-[#d4c4a8] appearance-none" value={adminNewAsset.targetId} onChange={(e) => setAdminNewAsset({...adminNewAsset, targetId: e.target.value})}>
                            <option value="">Select Ore...</option>
                            {Object.keys(ORE_ICONS).map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        )}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2"><label className="text-[8px] font-bold text-[#8d6e63] uppercase tracking-[0.2em] ml-1 font-retro">Rarity (Ingots Only)</label>
                        <select disabled={adminNewAsset.type === 'ore'} className="w-full bg-[#1a0f0a] border-2 border-[#5d4037] px-4 py-2.5 focus:border-amber-500 outline-none text-xs font-bold text-[#d4c4a8] appearance-none disabled:opacity-30" value={adminNewAsset.rarity} onChange={(e) => setAdminNewAsset({...adminNewAsset, rarity: e.target.value as Rarity})}>
                          <option value="common">Common</option>
                          <option value="uncommon">Uncommon</option>
                          <option value="rare">Rare</option>
                          <option value="epic">Epic</option>
                          <option value="legendary">Legendary</option>
                        </select>
                      </div>
                      <div className="space-y-2"><label className="text-[8px] font-bold text-[#8d6e63] uppercase tracking-[0.2em] ml-1 font-retro">Icon Source</label>
                        <div className="flex space-x-2">
                          <input type="text" placeholder="https://..." className="flex-1 bg-[#1a0f0a] border-2 border-[#5d4037] px-4 py-2.5 focus:border-amber-500 outline-none text-xs font-retro text-blue-400" value={adminNewAsset.icon_url} onChange={(e) => setAdminNewAsset({...adminNewAsset, icon_url: e.target.value})} />
                          <label className="cursor-pointer bg-[#3e2723] border-2 border-[#8d6e63] px-4 py-2.5 text-[10px] font-bold text-amber-500 hover:bg-[#5d4037] transition-all flex items-center justify-center font-retro shadow-lg">
                            UPLOAD
                            <input type="file" className="hidden" accept="image/*,image/webp" onChange={(e) => handleLocalImageUpload(e, (url) => setAdminNewAsset({...adminNewAsset, icon_url: url}))} />
                          </label>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-end">
                      <button type="submit" disabled={isSyncing} className="w-full bg-blue-900/40 hover:bg-blue-800/60 text-blue-400 border-2 border-blue-400 font-medieval font-extrabold py-4 transition-all uppercase tracking-[0.2em] text-[10px] disabled:opacity-50 shadow-xl">UPDATE ASSET</button>
                    </div>
                </form>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                  {/* List Ingot Assets */}
                  <div className="space-y-2">
                    <h3 className="text-[10px] font-retro text-[#8d6e63] uppercase tracking-widest border-b border-[#5d4037] pb-1">Ingot Skins</h3>
                    {Object.entries(cloudSkins).map(([id, url]) => (
                      <div key={id} className={`bg-[#1a0f0a] p-2 border ${getRarityBorder(cloudRarities[id])} flex items-center space-x-3 group shadow-inner`}>
                        <img src={url} className={`w-8 h-8 object-contain bg-[#1a0f0a] border ${getRarityBorder(cloudRarities[id])}`} alt="icon" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold truncate text-[#d4c4a8] uppercase tracking-widest font-retro">{RECIPES.find(r => r.id === id)?.name || id}</div>
                          <div className={`text-[8px] font-retro uppercase ${cloudRarities[id] ? `text-[${RARITY_COLORS[cloudRarities[id]]}]` : 'text-[#8d6e63]'}`}>{cloudRarities[id] || 'common'}</div>
                        </div>
                        <button onClick={() => handleAdminDeleteAsset('ingot', id)} className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-red-500/10 rounded font-bold text-[8px] uppercase font-retro">Purge</button>
                      </div>
                    ))}
                  </div>
                  {/* List Ore Assets */}
                  <div className="space-y-2">
                    <h3 className="text-[10px] font-retro text-[#8d6e63] uppercase tracking-widest border-b border-[#5d4037] pb-1">Ore Icons</h3>
                    {Object.entries(oreSkins).map(([name, url]) => (
                      <div key={name} className="bg-[#1a0f0a] p-2 border border-[#5d4037] flex items-center space-x-3 group shadow-inner">
                        <img src={url} className="w-8 h-8 object-contain bg-[#1a0f0a] border border-[#5d4037]" alt="icon" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold truncate text-[#d4c4a8] uppercase tracking-widest font-retro">{name}</div>
                        </div>
                        <button onClick={() => handleAdminDeleteAsset('ore', name)} className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-red-500/10 rounded font-bold text-[8px] uppercase font-retro">Purge</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-4 py-4 flex flex-col items-center max-w-6xl mx-auto opacity-60 flex-shrink-0">
        <div className="flex flex-wrap justify-center gap-4 mb-4">
          {userRole === 'guest' ? (
            <><button onClick={() => {setLoginType('admin'); setShowLoginModal(true);}} className="px-8 py-3 bg-[#3e2723] border-2 border-amber-500 text-amber-500 font-medieval font-extrabold tracking-[0.2em] text-[10px] hover:bg-[#5d4037] transition-all shadow-lg">ROOT ACCESS</button>
              <button onClick={() => {setLoginType('pro'); setShowLoginModal(true);}} className="px-8 py-3 bg-[#3e2723] border-2 border-purple-500 text-purple-400 font-medieval font-bold text-[10px] tracking-[0.2em] hover:bg-[#5d4037] transition-all shadow-lg">PRO DEPLOYMENT</button></>
          ) : (
            <button onClick={() => {setUserRole('guest'); setCurrentUser(null); setActiveTab('calculator'); notify("Session purged.");}} className="px-8 py-3 bg-[#1a0f0a] border-2 border-red-500/30 text-red-500 font-medieval font-bold text-[10px] tracking-[0.2em] hover:bg-red-950 transition-all shadow-lg">TERMINATE CONNECTION</button>
          )}
        </div>
        <div className="bg-[#1a0f0a] px-4 py-1 border border-[#5d4037] shadow-inner">
          <p className="text-[9px] font-retro text-[#8d6e63] uppercase tracking-[0.2em]">
            Travelers Encountered: <span className="text-amber-500 font-bold">{visitorCount?.toLocaleString() || '...'}</span>
          </p>
        </div>
      </footer>

      {showLoginModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[150] p-6 animate-in fade-in duration-500">
          <div className="bg-[#2b1d16] border-4 border-[#5d4037] p-10 rounded-none w-full max-w-lg shadow-2xl relative">
            <h2 className={`text-3xl font-medieval font-bold mb-8 text-center tracking-tighter ${loginType === 'admin' ? 'text-amber-500' : 'text-purple-400'}`}>{loginType === 'admin' ? 'MASTER AUTH' : 'PRO SYNC'}</h2>
            
            <form onSubmit={handleLogin} className="space-y-8">
              <div className="space-y-3">
                <div className="flex justify-between items-center ml-2">
                  <label className="text-[10px] font-bold text-[#8d6e63] uppercase tracking-[0.3em] font-retro">Trader Handle (ID)</label>
                </div>
                <input type="text" autoFocus placeholder="e.g. 1d08d1f7-..." className="w-full bg-[#1a0f0a] border-2 border-[#5d4037] px-6 py-4 text-center font-bold text-[#d4c4a8] focus:border-amber-500 outline-none transition-all tracking-widest text-xs" value={loginInput.handle} onChange={(e) => setLoginInput({...loginInput, handle: e.target.value})} />
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center ml-2">
                  <label className="text-[10px] font-bold text-[#8d6e63] uppercase tracking-[0.3em] font-retro">Cloud Key</label>
                </div>
                <input type="password" placeholder="••••••••" className="w-full bg-[#1a0f0a] border-2 border-[#5d4037] px-6 py-4 text-center font-retro text-2xl focus:border-amber-500 outline-none transition-all text-amber-500 tracking-[0.4em]" value={loginInput.key} onChange={(e) => setLoginInput({...loginInput, key: e.target.value})} />
              </div>
              
              <div className="space-y-4 pt-4">
                <div className="flex space-x-4">
                  <button type="button" onClick={() => setShowLoginModal(false)} className="flex-1 bg-[#3e2723] py-4 border-2 border-[#5d4037] font-bold uppercase tracking-[0.3em] text-[10px] hover:bg-[#5d4037] transition-colors text-[#8d6e63] font-retro">ABORT</button>
                  <button type="submit" disabled={isVerifying} className={`flex-1 ${loginType === 'admin' ? 'bg-amber-900/40 text-amber-500 border-2 border-amber-500' : 'bg-purple-900/40 text-purple-400 border-2 border-purple-500'} py-4 font-bold uppercase tracking-[0.3em] text-[10px] disabled:opacity-50 shadow-2xl font-retro`}>{isVerifying ? 'LINKING...' : 'SYNC IDENTITY'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const TabButton = ({ active, onClick, label, color }: { active: boolean, onClick: () => void, label: string, color: 'cyan' | 'purple' | 'amber' }) => {
  const themes = {
    cyan: active ? 'bg-[#5d4037] border-amber-500 shadow-[0_0_20px_rgba(212,175,55,0.5)] text-white scale-105' : 'bg-[#2b1d16] border-[#5d4037] text-[#8d6e63] hover:text-[#d4c4a8]',
    purple: active ? 'bg-[#4b0082] border-[#9370db] shadow-[0_0_20px_rgba(147,112,219,0.5)] text-white scale-105' : 'bg-[#2b1d16] border-[#5d4037] text-[#8d6e63] hover:text-[#d4c4a8]',
    amber: active ? 'bg-[#b8860b] border-[#ffd700] shadow-[0_0_20px_rgba(255,215,0,0.5)] text-white scale-105' : 'bg-[#2b1d16] border-[#5d4037] text-[#8d6e63] hover:text-[#d4c4a8]',
  };
  return <button onClick={onClick} className={`px-10 py-3 font-bold transition-all border-4 font-retro text-[14px] tracking-[0.2em] uppercase ${themes[color]} relative overflow-hidden group`}>
    <span className="relative z-10">{label}</span>
    <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
  </button>;
};

interface StockInputProps { label: string; value: number; onChange: (val: string) => void; icon: string; isImage?: boolean; }
const StockInput: React.FC<StockInputProps> = ({ label, value, onChange, icon, isImage }) => (
  <div className="space-y-2"><label className="text-[9px] font-bold text-[#8d6e63] uppercase flex items-center tracking-widest ml-1 font-retro">
    <span className="mr-2 text-base drop-shadow-md flex items-center justify-center w-6 h-6">
      {isImage ? <img src={icon} className="w-5 h-5 object-contain" alt="icon" /> : icon}
    </span> {label}</label>
    <input type="number" min="0" className="w-full bg-[#1a0f0a] border-2 border-[#5d4037] px-3 py-2 text-[#d4af37] focus:border-amber-500 font-retro text-lg outline-none transition-all shadow-inner" value={value === 0 ? '' : value} placeholder="0" onChange={(e) => onChange(e.target.value)} />
  </div>
);

export default App;