
import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from 'https://esm.sh/@supabase/supabase-js';
import { RECIPES } from './constants';
import { TabType, Stock, SaleItem, AssetImages, IngotRecipe, UserRole, MarketItemTemplate, AuthorizedKey, Notification } from './types';

// --- SUPABASE CONFIGURATION ---
const SUPABASE_URL = 'https://kgstbnbsqvxrigsgpslf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtnc3RibmJzcXZ4cmlnc2dwc2xmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwMjcwNTEsImV4cCI6MjA4NTYwMzA1MX0.69-65de7EKEDqFKFqcn585vtre10OcotZFeRYV14pTY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// ------------------------------

const ORE_ICONS: { [key: string]: string } = {
  'Coal': '⬛',
  'Copper Ore': '🟫',
  'Iron Ore': '🌑',
  'Silver Ore': '💿',
  'Gold Ore': '🟡',
  'Adamantium Ore': '💠',
  'Dragon Glass Ore': '🟣',
};

// --- HELPER: CALCULATE MAX CRAFTABLE ---
// Determines the maximum number of items that can be forged based on currently available resources.
const calculateMaxIngots = (recipeId: string, stock: Stock): number => {
  const recipe = RECIPES.find(r => r.id === recipeId);
  if (!recipe) return 0;

  const oreMapping: Record<string, keyof Stock> = {
    'Coal': 'coal',
    'Copper Ore': 'copperOre',
    'Iron Ore': 'ironOre',
    'Silver Ore': 'silverOre',
    'Gold Ore': 'goldOre',
    'Adamantium Ore': 'adamantiumOre',
    'Dragon Glass Ore': 'dragonGlassOre'
  };

  const limits: number[] = [];

  // Coal constraint
  if (recipe.requirements.coal > 0) {
    limits.push(Math.floor(stock.coal / recipe.requirements.coal));
  }

  // Ore constraint
  const oreKey = oreMapping[recipe.requirements.oreType];
  if (oreKey && recipe.requirements.ore > 0) {
    limits.push(Math.floor(stock[oreKey] / recipe.requirements.ore));
  }

  // Prerequisite ingot constraint
  if (recipe.requirements.previousIngot) {
    const prevKey = recipe.requirements.previousIngot.type as keyof Stock;
    if (stock[prevKey] !== undefined) {
      limits.push(Math.floor(stock[prevKey] / recipe.requirements.previousIngot.amount));
    }
  }

  return limits.length > 0 ? Math.min(...limits) : 0;
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('calculator');
  const [userRole, setUserRole] = useState<UserRole>('guest');
  const [currentUser, setCurrentUser] = useState<AuthorizedKey | null>(null);
  
  // UI State
  const [passwordInput, setPasswordInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginType, setLoginType] = useState<'admin' | 'pro'>('admin');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Cloud Data
  const [itemDatabase, setItemDatabase] = useState<MarketItemTemplate[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [cloudSkins, setCloudSkins] = useState<AssetImages>({});
  const [userRegistry, setUserRegistry] = useState<AuthorizedKey[]>([]);

  // Local Stock
  const [stock, setStock] = useState<Stock>(() => {
    const saved = localStorage.getItem('terrax_stock');
    return saved ? JSON.parse(saved) : {
      coal: 0, copperOre: 0, ironOre: 0, silverOre: 0, goldOre: 0, adamantiumOre: 0, dragonGlassOre: 0,
      copperIngot: 0, ironIngot: 0, silverIngot: 0, goldIngot: 0, adamantiumIngot: 0, dragonGlassIngot: 0,
    };
  });

  // Admin Forms
  const [newListing, setNewListing] = useState({ templateId: '', price: '', description: '', searchQuery: '' });
  const [adminNewItem, setAdminNewItem] = useState({ name: '', iconFile: null as File | null, iconBase64: '' });
  const [adminNewUser, setAdminNewUser] = useState({ role: 'pro', display_name: '', key_value: '', avatar_url: '' });

  // --- NOTIFICATION HELPER ---
  const notify = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  };

  // --- DATABASE SYNC LOGIC ---
  const fetchGlobalData = async () => {
    setIsSyncing(true);
    try {
      const { data: templates } = await supabase.from('market_templates').select('*').order('name');
      const { data: ads } = await supabase.from('sale_listings').select('*').order('created_at', { ascending: false });
      const { data: skins } = await supabase.from('forge_skins').select('*');
      
      if (templates) setItemDatabase(templates);
      if (ads) setSaleItems(ads);
      if (skins) {
          const skinMap: AssetImages = {};
          skins.forEach(s => skinMap[s.recipe_id] = s.image_url);
          setCloudSkins(skinMap);
      }

      if (userRole === 'admin') {
        const { data: users } = await supabase.from('authorized_keys').select('*').order('role');
        if (users) setUserRegistry(users);
      }
    } catch (error) {
      console.error("Sync Error:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchGlobalData();
  }, [userRole]);

  useEffect(() => {
    localStorage.setItem('terrax_stock', JSON.stringify(stock));
  }, [stock]);

  const filteredDatabase = useMemo(() => {
    return itemDatabase.filter(item => 
      item.name.toLowerCase().includes(newListing.searchQuery.toLowerCase())
    );
  }, [itemDatabase, newListing.searchQuery]);

  // --- ACTIONS ---

  const handleStockChange = (field: keyof Stock, value: string) => {
    const num = parseInt(value) || 0;
    setStock(prev => ({ ...prev, [field]: num }));
  };

  const handleCloudSkinUpload = async (id: string, file: File | null) => {
    if (!file) return;
    setIsSyncing(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const { error } = await supabase.from('forge_skins').upsert({
          recipe_id: id,
          image_url: reader.result as string
      });
      if (!error) {
        notify("Forge skin updated globally!", "success");
        fetchGlobalData();
      } else notify("Skin error: " + error.message, "error");
      setIsSyncing(false);
    };
    reader.readAsDataURL(file);
  };

  const handleListingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const template = itemDatabase.find(t => t.id === newListing.templateId);
    if (!template || !newListing.price) return;

    setIsSyncing(true);
    const { error } = await supabase.from('sale_listings').insert([{
      template_id: template.id,
      name: template.name,
      price: newListing.price,
      description: newListing.description,
      image_url: template.icon_url,
      seller: currentUser?.display_name || 'Anonymous',
      seller_avatar: currentUser?.avatar_url || '',
      is_pro: userRole === 'pro',
    }]);

    if (!error) {
      setNewListing({ templateId: '', price: '', description: '', searchQuery: '' });
      notify("Ad published to market.", "success");
      fetchGlobalData();
    } else {
      notify("Market error: " + error.message, "error");
    }
    setIsSyncing(false);
  };

  const handleAdminItemAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminNewItem.name || !adminNewItem.iconBase64) return;
    setIsSyncing(true);
    const { error } = await supabase.from('market_templates').insert([{
      name: adminNewItem.name,
      icon_url: adminNewItem.iconBase64 
    }]);
    if (!error) {
      setAdminNewItem({ name: '', iconFile: null, iconBase64: '' });
      notify("Registry item added.", "success");
      fetchGlobalData();
    } else notify("Registry error: " + error.message, "error");
    setIsSyncing(false);
  };

  const handleAdminCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminNewUser.display_name || !adminNewUser.key_value) return;
    setIsSyncing(true);
    const avatar = adminNewUser.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${adminNewUser.display_name}`;
    const { error } = await supabase.from('authorized_keys').insert([{
      role: adminNewUser.role,
      display_name: adminNewUser.display_name,
      key_value: adminNewUser.key_value,
      avatar_url: avatar
    }]);
    if (!error) {
      setAdminNewUser({ role: 'pro', display_name: '', key_value: '', avatar_url: '' });
      notify(`${adminNewUser.role.toUpperCase()} user created!`, "success");
      fetchGlobalData();
    } else notify("Key creation error: " + error.message, "error");
    setIsSyncing(false);
  };

  const handleAdminDeleteUser = async (id: string) => {
    if (id === currentUser?.id) return notify("Cannot delete your own session.", "error");
    setIsSyncing(true);
    await supabase.from('authorized_keys').delete().eq('id', id);
    notify("User access revoked.", "info");
    fetchGlobalData();
  };

  const handleDeleteAd = async (id: string) => {
    setIsSyncing(true);
    await supabase.from('sale_listings').delete().eq('id', id);
    notify("Ad removed.", "info");
    fetchGlobalData();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput) return;
    setIsVerifying(true);
    try {
      const { data, error } = await supabase
        .from('authorized_keys')
        .select('*')
        .eq('role', loginType)
        .eq('key_value', passwordInput)
        .single();

      if (error || !data) {
        notify(`Invalid Access Key.`, "error");
      } else {
        setUserRole(loginType);
        setCurrentUser(data);
        notify(`Welcome back, ${data.display_name}!`, "success");
        setShowLoginModal(false);
      }
    } catch (err) {
      notify("Connection error.", "error");
    } finally {
      setIsVerifying(false);
      setPasswordInput('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-inter">
      {/* Custom Toast Container */}
      <div className="fixed top-8 right-8 z-[200] space-y-4 pointer-events-none">
        {notifications.map(n => (
          <div key={n.id} className={`px-6 py-4 rounded-2xl shadow-2xl border backdrop-blur-xl animate-in fade-in slide-in-from-right-10 flex items-center space-x-4 pointer-events-auto min-w-[300px] ${
            n.type === 'success' ? 'bg-green-500/10 border-green-500/50 text-green-400' :
            n.type === 'error' ? 'bg-red-500/10 border-red-500/50 text-red-400' :
            'bg-cyan-500/10 border-cyan-500/50 text-cyan-400'
          }`}>
            <div className="w-2 h-2 rounded-full bg-current"></div>
            <p className="text-sm font-bold tracking-tight">{n.message}</p>
          </div>
        ))}
      </div>

      <header className="max-w-6xl mx-auto mb-12 text-center relative">
        <div className="absolute top-0 right-0 flex items-center space-x-3">
            <button onClick={fetchGlobalData} className="text-[10px] font-mono text-cyan-500 hover:text-cyan-400 uppercase tracking-widest bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-500/30 transition-all">
                {isSyncing ? 'Syncing...' : '↻ Cloud Refresh'}
            </button>
        </div>
        <h1 className="text-6xl font-orbitron font-bold tracking-tighter bg-gradient-to-r from-cyan-400 via-purple-500 to-orange-500 bg-clip-text text-transparent mb-4">TERRAX</h1>
        <div className="flex justify-center items-center space-x-4 text-slate-400 text-xs font-semibold tracking-widest uppercase">
          {currentUser && <img src={currentUser.avatar_url} className="w-6 h-6 rounded-full border border-slate-700 bg-slate-900" alt="avatar" />}
          <span className="flex items-center uppercase tracking-widest">FORGE</span>
          <span className="w-1.5 h-1.5 rounded-full bg-slate-800"></span>
          <span className="flex items-center">MARKET</span>
          {userRole !== 'guest' && (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-slate-800"></span>
              <span className={`${userRole === 'admin' ? 'text-amber-400' : 'text-purple-400'} font-bold`}>{currentUser?.display_name || 'ACTIVE'}</span>
            </>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto mb-10 flex justify-center space-x-3">
        <TabButton active={activeTab === 'calculator'} onClick={() => setActiveTab('calculator')} label="Forge" color="cyan" />
        <TabButton active={activeTab === 'marketplace'} onClick={() => setActiveTab('marketplace')} label="Market" color="purple" />
        {userRole === 'admin' && (
          <TabButton active={activeTab === 'assets'} onClick={() => setActiveTab('assets')} label="Admin" color="amber" />
        )}
      </div>

      <main className="max-w-6xl mx-auto">
        {activeTab === 'calculator' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-500">
            <div className="bg-slate-900/40 p-8 rounded-3xl border border-slate-800/50 backdrop-blur-xl h-fit sticky top-8 shadow-2xl">
              <h2 className="text-xl font-orbitron font-bold mb-8 flex items-center tracking-widest"><span className="mr-3 text-cyan-400 opacity-50">#</span> RESOURCES</h2>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <StockInput label="Coal" value={stock.coal} onChange={(v) => handleStockChange('coal', v)} icon={ORE_ICONS['Coal']} />
                  <StockInput label="Copper Ore" value={stock.copperOre} onChange={(v) => handleStockChange('copperOre', v)} icon={ORE_ICONS['Copper Ore']} />
                  <StockInput label="Iron Ore" value={stock.ironOre} onChange={(v) => handleStockChange('ironOre', v)} icon={ORE_ICONS['Iron Ore']} />
                  <StockInput label="Silver Ore" value={stock.silverOre} onChange={(v) => handleStockChange('silverOre', v)} icon={ORE_ICONS['Silver Ore']} />
                  <StockInput label="Gold Ore" value={stock.goldOre} onChange={(v) => handleStockChange('goldOre', v)} icon={ORE_ICONS['Gold Ore']} />
                  <StockInput label="Adamant Ore" value={stock.adamantiumOre} onChange={(v) => handleStockChange('adamantiumOre', v)} icon={ORE_ICONS['Adamantium Ore']} />
                  <StockInput label="Dragon Ore" value={stock.dragonGlassOre} onChange={(v) => handleStockChange('dragonGlassOre', v)} icon={ORE_ICONS['Dragon Glass Ore']} />
                </div>
                <div className="h-px bg-gradient-to-r from-transparent via-slate-800 to-transparent my-8" />
                <div className="grid grid-cols-2 gap-4">
                  <StockInput label="Copper" value={stock.copperIngot} onChange={(v) => handleStockChange('copperIngot', v)} icon="🟧" />
                  <StockInput label="Iron" value={stock.ironIngot} onChange={(v) => handleStockChange('ironIngot', v)} icon="⬜" />
                  <StockInput label="Silver" value={stock.silverIngot} onChange={(v) => handleStockChange('silverIngot', v)} icon="💠" />
                  <StockInput label="Gold" value={stock.goldIngot} onChange={(v) => handleStockChange('goldIngot', v)} icon="📀" />
                  <StockInput label="Adamant" value={stock.adamantiumIngot} onChange={(v) => handleStockChange('adamantiumIngot', v)} icon="💎" />
                  <StockInput label="Dragon" value={stock.dragonGlassIngot} onChange={(v) => handleStockChange('dragonGlassIngot', v)} icon="🟣" />
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
              {RECIPES.map((recipe) => {
                const max = calculateMaxIngots(recipe.id, stock);
                return (
                  <div key={recipe.id} className="group bg-slate-900/60 rounded-3xl border border-slate-800/50 overflow-hidden hover:border-cyan-500/40 transition-all duration-500 shadow-2xl">
                    <div className="p-6">
                      <div className="flex items-center space-x-5 mb-6">
                        <div className="w-[50px] h-[50px] bg-slate-950 rounded-xl flex items-center justify-center overflow-hidden border border-slate-800 shadow-inner group-hover:scale-110 transition-transform">
                          <img src={cloudSkins[recipe.id] || recipe.image} alt={recipe.name} className="w-full h-full object-contain" />
                        </div>
                        <div>
                          <h3 className={`text-xl font-orbitron font-bold ${recipe.color} tracking-tight`}>{recipe.name}</h3>
                          <div className="text-[9px] text-slate-500 uppercase font-bold flex items-center tracking-widest mt-1">{recipe.requirements.oreType} <span className="ml-2">{ORE_ICONS[recipe.requirements.oreType]}</span></div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-8 text-center">
                         <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-800/50">
                            <div className="text-[9px] text-slate-500 uppercase font-bold mb-1">Coal Cost</div>
                            <div className="text-sm font-mono text-slate-200">{(recipe.requirements.coal * (max || 1)).toLocaleString()}</div>
                         </div>
                         <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-800/50">
                            <div className="text-[9px] text-slate-500 uppercase font-bold mb-1">Ore Cost</div>
                            <div className="text-sm font-mono text-slate-200">{(recipe.requirements.ore * (max || 1)).toLocaleString()}</div>
                         </div>
                      </div>
                      <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 p-6 rounded-2xl border border-slate-700/30 text-center relative overflow-hidden">
                        <span className="block text-[10px] uppercase tracking-[0.3em] text-slate-500 mb-2 font-bold">Forge Yield</span>
                        <span className={`text-4xl font-orbitron font-bold ${max > 0 ? 'text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.3)]' : 'text-slate-700'}`}>{max.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'marketplace' && (
          <div className="space-y-10 animate-in fade-in duration-500">
            {(userRole === 'admin' || userRole === 'pro') && (
              <div className={`bg-slate-900/40 border-2 ${userRole === 'admin' ? 'border-amber-500/20 shadow-amber-900/10' : 'border-purple-500/20 shadow-purple-900/10'} p-10 rounded-[2.5rem] max-w-4xl mx-auto backdrop-blur-2xl shadow-2xl relative overflow-hidden`}>
                <h2 className="text-3xl font-orbitron font-bold mb-8 flex items-center relative">
                  <span className={`mr-4 p-3 ${userRole === 'admin' ? 'bg-amber-500/20 text-amber-400' : 'bg-purple-500/20 text-purple-400'} rounded-2xl shadow-xl`}>📦</span> 
                  PUBLISH TRADE OFFER
                </h2>
                <form onSubmit={handleListingSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-8 relative">
                  <div className="space-y-6">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Cloud Search</label>
                      <div className="relative group">
                          <input type="text" placeholder="Search global registry..." className="w-full bg-slate-950 border-2 border-slate-800 rounded-2xl px-5 py-4 focus:outline-none focus:border-cyan-500 transition-all text-sm" value={newListing.searchQuery} onChange={(e) => setNewListing({...newListing, searchQuery: e.target.value})} />
                          {newListing.searchQuery && (
                              <div className="absolute top-full left-0 right-0 bg-slate-900 border-2 border-slate-800 rounded-2xl mt-2 z-50 max-h-60 overflow-y-auto shadow-2xl p-2 space-y-1">
                                  {filteredDatabase.map(item => (
                                      <button key={item.id} type="button" onClick={() => setNewListing({...newListing, templateId: item.id, searchQuery: item.name})} className="w-full flex items-center space-x-3 p-3 hover:bg-slate-800 rounded-xl transition-colors text-left">
                                          <img src={item.icon_url} className="w-8 h-8 object-contain bg-slate-950 rounded" />
                                          <span className="text-sm font-bold">{item.name}</span>
                                      </button>
                                  ))}
                              </div>
                          )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Price Offer</label>
                      <input type="text" placeholder="e.g. 5M Gold" className="w-full bg-slate-950 border-2 border-slate-800 rounded-2xl px-5 py-4 focus:outline-none focus:border-cyan-500 transition-all text-sm" value={newListing.price} onChange={(e) => setNewListing({...newListing, price: e.target.value})} />
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Trade Notes</label>
                      <textarea placeholder="Trade details..." className="w-full bg-slate-950 border-2 border-slate-800 rounded-2xl px-5 py-4 h-[126px] focus:outline-none focus:border-cyan-500 transition-all text-sm resize-none" value={newListing.description} onChange={(e) => setNewListing({...newListing, description: e.target.value})}></textarea>
                    </div>
                    <button type="submit" disabled={isSyncing} className={`w-full py-5 rounded-2xl font-orbitron font-extrabold tracking-widest text-sm transition-all shadow-2xl ${userRole === 'admin' ? 'bg-amber-600 hover:bg-amber-500 text-slate-950' : 'bg-purple-600 hover:bg-purple-500 text-white'} disabled:opacity-50`}>
                      {isSyncing ? 'SYNCING...' : 'PUBLISH TO CLOUD'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {saleItems.map(item => (
                <div key={item.id} className="group bg-slate-900/40 border border-slate-800/60 rounded-[2rem] overflow-hidden hover:border-cyan-500/30 transition-all flex flex-col hover:shadow-2xl">
                  <div className="p-8 flex items-start space-x-5">
                    <div className="w-[64px] h-[64px] bg-slate-950 rounded-2xl flex items-center justify-center border-2 border-slate-800 shadow-lg">
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-contain" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <h3 className="text-xl font-orbitron font-bold truncate text-white">{item.name}</h3>
                        {item.is_pro && <div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_purple] mt-2"></div>}
                      </div>
                      <div className="text-cyan-400 font-mono font-bold text-base mt-1">{item.price}</div>
                    </div>
                  </div>
                  <div className="px-8 pb-8 pt-2 flex-1">
                    <div className="bg-slate-950/30 rounded-2xl p-4 border border-slate-800/30 h-full text-slate-400 text-xs italic line-clamp-3">"{item.description || 'Verified Trade Signal'}"</div>
                  </div>
                  <div className="bg-slate-950/60 px-8 py-5 border-t border-slate-800/40 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {item.seller_avatar && <img src={item.seller_avatar} className="w-6 h-6 rounded-full border border-slate-800 bg-slate-900" alt="seller" />}
                      <span className="text-[10px] font-bold text-slate-200 truncate max-w-[120px]">{item.seller}</span>
                    </div>
                    {(userRole === 'admin' || (userRole === 'pro' && item.seller === currentUser?.display_name)) && (
                        <button onClick={() => handleDeleteAd(item.id)} className="text-[10px] font-bold text-red-500/50 hover:text-red-500 transition-colors uppercase">Remove</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'assets' && userRole === 'admin' && (
          <div className="space-y-12 pb-20 animate-in fade-in duration-500">
            {/* User Access Management */}
            <div className="bg-slate-900/40 border border-slate-800/50 p-10 rounded-[2.5rem] shadow-2xl backdrop-blur-xl">
              <h2 className="text-3xl font-orbitron font-bold mb-8 text-amber-400 uppercase tracking-tighter">Authorized Access Management</h2>
              <form onSubmit={handleAdminCreateUser} className="grid grid-cols-1 md:grid-cols-4 gap-6 bg-slate-950/50 p-8 rounded-3xl mb-12 border border-slate-800/50">
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Type</label>
                    <select className="w-full bg-slate-900 border-2 border-slate-800 rounded-2xl px-5 py-4 focus:border-amber-500 outline-none text-sm" value={adminNewUser.role} onChange={(e) => setAdminNewUser({...adminNewUser, role: e.target.value})}>
                      <option value="pro">Pro User</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Display Name</label>
                    <input type="text" placeholder="e.g. Master Trader" className="w-full bg-slate-900 border-2 border-slate-800 rounded-2xl px-5 py-4 focus:border-amber-500 outline-none text-sm" value={adminNewUser.display_name} onChange={(e) => setAdminNewUser({...adminNewUser, display_name: e.target.value})} />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Access Key</label>
                    <input type="text" placeholder="Secure Secret" className="w-full bg-slate-900 border-2 border-slate-800 rounded-2xl px-5 py-4 focus:border-amber-500 outline-none text-sm font-mono" value={adminNewUser.key_value} onChange={(e) => setAdminNewUser({...adminNewUser, key_value: e.target.value})} />
                  </div>
                  <div className="flex items-end">
                    <button type="submit" disabled={isSyncing} className="w-full bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-2xl font-orbitron font-extrabold py-4 transition-all uppercase tracking-widest text-xs disabled:opacity-50">AUTHORIZE USER</button>
                  </div>
              </form>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {userRegistry.map(user => (
                  <div key={user.id} className="bg-slate-950/80 p-5 rounded-2xl border border-slate-800/60 flex items-center space-x-4 group relative">
                    <img src={user.avatar_url} className="w-10 h-10 rounded-full border border-slate-800" alt="avatar" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold truncate text-slate-200">{user.display_name}</div>
                      <div className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">{user.role} • {user.key_value}</div>
                    </div>
                    <button onClick={() => handleAdminDeleteUser(user.id)} className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-red-500/10 rounded-lg">×</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900/40 border border-slate-800/50 p-10 rounded-[2.5rem] shadow-2xl backdrop-blur-xl">
              <h2 className="text-3xl font-orbitron font-bold mb-8 text-amber-400 uppercase tracking-tighter">Global Cloud Registry</h2>
              <form onSubmit={handleAdminItemAdd} className="grid grid-cols-1 md:grid-cols-3 gap-8 bg-slate-950/50 p-8 rounded-3xl mb-12 border border-slate-800/50">
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">New Cloud Item</label>
                    <input type="text" placeholder="e.g. Master Key" className="w-full bg-slate-900 border-2 border-slate-800 rounded-2xl px-5 py-4 focus:border-amber-500 outline-none text-sm" value={adminNewItem.name} onChange={(e) => setAdminNewItem({...adminNewItem, name: e.target.value})} />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Cloud Image</label>
                    <label className="flex items-center justify-center w-full h-[58px] bg-slate-900 border-2 border-slate-800 rounded-2xl cursor-pointer hover:border-amber-500 transition-all text-xs text-slate-400 font-bold overflow-hidden relative group">
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                          const file = e.target.files ? e.target.files[0] : null;
                          if (file) {
                              const reader = new FileReader();
                              reader.onloadend = () => setAdminNewItem({...adminNewItem, iconFile: file, iconBase64: reader.result as string});
                              reader.readAsDataURL(file);
                          }
                      }} />
                      {adminNewItem.iconFile ? <span className="truncate px-4">{adminNewItem.iconFile.name}</span> : <span>SELECT LOCAL FILE</span>}
                    </label>
                  </div>
                  <div className="flex items-end">
                    <button type="submit" disabled={isSyncing} className="w-full bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-2xl font-orbitron font-extrabold py-4 transition-all uppercase tracking-widest text-xs disabled:opacity-50">SYNC TO CLOUD</button>
                  </div>
              </form>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
                {itemDatabase.map(item => (
                  <div key={item.id} className="bg-slate-950/80 p-5 rounded-2xl border border-slate-800/60 flex items-center space-x-4 group relative">
                    <img src={item.icon_url} className="w-10 h-10 object-contain rounded-lg border border-slate-800" alt="icon" />
                    <span className="text-xs font-bold truncate flex-1">{item.name}</span>
                    <button onClick={() => supabase.from('market_templates').delete().eq('id', item.id).then(() => fetchGlobalData())} className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-32 pt-16 pb-20 flex flex-col items-center max-w-6xl mx-auto opacity-60">
        <div className="flex flex-wrap justify-center gap-6 mb-12">
          {userRole === 'guest' ? (
            <>
              <button onClick={() => {setLoginType('admin'); setShowLoginModal(true);}} className="px-12 py-5 bg-gradient-to-br from-orange-400 to-yellow-500 rounded-3xl text-slate-950 font-orbitron font-extrabold tracking-widest text-xs hover:scale-110 transition-transform shadow-xl">🛡️ ROOT SYNC</button>
              <button onClick={() => {setLoginType('pro'); setShowLoginModal(true);}} className="px-12 py-5 bg-slate-900 border-2 border-purple-500/50 text-purple-400 rounded-3xl font-orbitron font-bold text-xs tracking-widest hover:border-purple-500 transition-all shadow-xl">PRO ACCESS</button>
            </>
          ) : (
            <button onClick={() => {setUserRole('guest'); setCurrentUser(null); setActiveTab('calculator'); notify("Session terminated.");}} className="px-12 py-5 bg-slate-900 border-2 border-red-500/30 text-red-500 rounded-3xl font-orbitron font-bold text-xs tracking-widest hover:bg-red-950 transition-all">TERMINATE SESSION</button>
          )}
        </div>
        <p className="text-[10px] font-orbitron uppercase tracking-[0.5em]">TerraX Cloud Active</p>
      </footer>

      {showLoginModal && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-2xl flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-800 p-12 rounded-[3rem] w-full max-w-md shadow-2xl relative">
            <h2 className={`text-3xl font-orbitron font-bold mb-10 text-center ${loginType === 'admin' ? 'text-orange-400' : 'text-purple-400'}`}>{loginType === 'admin' ? 'CLOUD KEY' : 'PRO ACTIVATION'}</h2>
            <form onSubmit={handleLogin} className="space-y-8">
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2">Access Key</label>
                <input type="password" autoFocus placeholder="••••••••" className="w-full bg-slate-950 border-2 border-slate-800 rounded-2xl px-6 py-5 text-center font-mono text-xl focus:border-cyan-500 outline-none transition-all" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} />
              </div>
              <div className="flex space-x-4 pt-4">
                <button type="button" onClick={() => setShowLoginModal(false)} className="flex-1 bg-slate-800 py-5 rounded-2xl font-bold uppercase tracking-widest text-[10px] hover:bg-slate-700 transition-colors">BACK</button>
                <button type="submit" disabled={isVerifying} className={`flex-1 ${loginType === 'admin' ? 'bg-orange-600' : 'bg-purple-600'} py-5 rounded-2xl font-bold uppercase tracking-widest text-[10px] text-white disabled:opacity-50 transition-all`}>{isVerifying ? 'VERIFYING...' : 'SYNC LOGIN'}</button>
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
    cyan: active ? 'bg-cyan-600 border-cyan-400 shadow-cyan-900/50 text-white scale-105' : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700',
    purple: active ? 'bg-purple-600 border-purple-400 shadow-purple-900/50 text-white scale-105' : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700',
    amber: active ? 'bg-amber-600 border-amber-400 shadow-amber-900/50 text-white scale-105' : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700',
  };
  return (
    <button onClick={onClick} className={`px-12 py-4 rounded-2xl font-bold transition-all border-2 font-orbitron text-[10px] tracking-widest uppercase ${themes[color]}`}>{label}</button>
  );
};

interface StockInputProps {
  label: string;
  value: number;
  onChange: (val: string) => void;
  icon: string;
}

const StockInput: React.FC<StockInputProps> = ({ label, value, onChange, icon }) => (
  <div className="space-y-2">
    <label className="text-[8px] font-bold text-slate-500 uppercase flex items-center tracking-widest ml-1"><span className="mr-2 text-sm">{icon}</span> {label}</label>
    <input type="number" min="0" className="w-full bg-slate-950/80 border-2 border-slate-800/50 rounded-xl px-4 py-3 text-slate-200 focus:border-cyan-500 font-mono text-xs outline-none transition-all shadow-inner" value={value === 0 ? '' : value} placeholder="0" onChange={(e) => onChange(e.target.value)} />
  </div>
);

export default App;
