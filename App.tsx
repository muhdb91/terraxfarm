import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from 'https://esm.sh/@supabase/supabase-js';
import { RECIPES } from './constants';
import { TabType, Stock, SaleItem, AssetImages, IngotRecipe, UserRole, MarketItemTemplate, AuthorizedKey, Notification } from './types';

// --- SUPABASE CONFIGURATION ---
const SUPABASE_URL = 'https://kgstbnbsqvxrigsgpslf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtnc3RibmJzcXZ4cmlnc2dwc2xmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwMjcwNTEsImV4cCI6MjA4NTYwMzA1MX0.69-65de7EKEDqFKFqcn585vtre10OcotZFeRYV14pTY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
  const [userRegistry, setUserRegistry] = useState<AuthorizedKey[]>([]);

  const [stock, setStock] = useState<Stock>(() => {
    const saved = localStorage.getItem('terrax_stock');
    return saved ? JSON.parse(saved) : {
      coal: 0, copperOre: 0, ironOre: 0, silverOre: 0, goldOre: 0, adamantiumOre: 0, dragonGlassOre: 0,
      copperIngot: 0, ironIngot: 0, silverIngot: 0, goldIngot: 0, adamantiumIngot: 0, dragonGlassIngot: 0,
    };
  });

  const [newListing, setNewListing] = useState({ templateId: '', price: '', description: '', searchQuery: '' });
  const [adminNewUser, setAdminNewUser] = useState({ role: 'pro', key_value: '' });

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
    } catch (e) { console.error(e); } finally { setIsSyncing(false); }
  };

  useEffect(() => { fetchGlobalData(); }, [userRole]);
  useEffect(() => { localStorage.setItem('terrax_stock', JSON.stringify(stock)); }, [stock]);

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

  return (
    <div className="min-h-screen bg-[#1a120b] text-[#e2d1c3] p-4 md:p-8 font-serif-fantasy selection:bg-[#4a3728] selection:text-white">
      <div className="fixed top-8 right-8 z-[200] space-y-4 pointer-events-none">
        {notifications.map(n => (
          <div key={n.id} className={`px-6 py-5 rounded-xl shadow-2xl border backdrop-blur-md animate-in fade-in slide-in-from-right-10 flex items-center space-x-5 pointer-events-auto min-w-[340px] ${
            n.type === 'success' ? 'bg-green-900/40 border-green-700/50 text-green-200' :
            n.type === 'error' ? 'bg-red-900/40 border-red-700/50 text-red-200' : 'bg-amber-900/40 border-amber-700/50 text-amber-200'
          }`}>
            <div className={`w-3 h-3 rounded-full ${n.type === 'success' ? 'bg-green-500 shadow-[0_0_10px_green]' : n.type === 'error' ? 'bg-red-500 shadow-[0_0_10px_red]' : 'bg-amber-500 shadow-[0_0_10px_amber]'}`}></div>
            <p className="text-sm font-medieval tracking-widest uppercase">{n.message}</p>
          </div>
        ))}
      </div>

      <header className="max-w-6xl mx-auto mb-12 text-center relative pt-12">
        <div className="absolute top-0 left-0 text-4xl opacity-20 pointer-events-none">🌿</div>
        <div className="absolute top-0 right-0 text-4xl opacity-20 pointer-events-none">🍃</div>
        <div className="absolute top-0 right-0">
            <button onClick={fetchGlobalData} className="text-[10px] font-medieval font-bold text-amber-500 uppercase tracking-widest bg-emerald-950/40 px-6 py-3 rounded-full border-2 border-amber-700/50 transition-all hover:bg-emerald-900/60 hover:border-amber-500 shadow-[0_0_15px_rgba(212,175,55,0.2)]">
                {isSyncing ? 'COMMUNING...' : 'REFRESH REGISTRY'}
            </button>
        </div>
        <h1 className="text-8xl font-medieval font-bold tracking-tighter bg-gradient-to-b from-[#d4af37] via-[#2d5a27] to-[#8b4513] bg-clip-text text-transparent mb-6 drop-shadow-[0_5px_15px_rgba(0,0,0,0.5)] animate-glow">TERRAX FORGE</h1>
        <div className="flex justify-center items-center space-x-6 text-[#a3b18a] text-[14px] font-bold tracking-[0.4em] uppercase font-medieval">
          <span className="flex items-center"><span className="mr-2">🌸</span> SMITHY</span>
          <span className="w-2 h-2 rotate-45 bg-[#d4af37]"></span>
          <span className="flex items-center">MARKET <span className="ml-2">🍄</span></span>
          {userRole !== 'guest' && (
            <>
              <span className="w-2 h-2 rotate-45 bg-[#d4af37]"></span>
              <span className={`${userRole === 'admin' ? 'text-amber-500' : 'text-purple-400'} font-bold flex items-center`}>
                <span className="mr-2">📜</span> {getUserDisplayName(currentUser)}
              </span>
            </>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto mb-16 flex justify-center space-x-4">
        <TabButton active={activeTab === 'calculator'} onClick={() => setActiveTab('calculator')} label="Forge" color="cyan" />
        <TabButton active={activeTab === 'marketplace'} onClick={() => setActiveTab('marketplace')} label="Market" color="purple" />
        {userRole === 'admin' && <TabButton active={activeTab === 'assets'} onClick={() => setActiveTab('assets')} label="Admin" color="amber" />}
      </div>

      <main className="max-w-6xl mx-auto">
        {activeTab === 'calculator' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
            <div className="bg-[#1a2416]/90 p-10 rounded-3xl border-2 border-[#3a5a40] backdrop-blur-md h-fit sticky top-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden">
              <div className="absolute -top-10 -right-10 text-8xl opacity-5 pointer-events-none">🌿</div>
              <h2 className="text-2xl font-medieval font-bold mb-10 tracking-widest text-[#d4af37] flex items-center">
                <span className="mr-4 text-[#588157] text-3xl">🪓</span> STOREHOUSE
              </h2>
              <div className="space-y-8">
                <div className="grid grid-cols-2 gap-5">
                  <StockInput label="Coal" value={stock.coal} onChange={(v) => handleStockChange('coal', v)} icon={ORE_ICONS['Coal']} />
                  <StockInput label="Copper Ore" value={stock.copperOre} onChange={(v) => handleStockChange('copperOre', v)} icon={ORE_ICONS['Copper Ore']} />
                  <StockInput label="Iron Ore" value={stock.ironOre} onChange={(v) => handleStockChange('ironOre', v)} icon={ORE_ICONS['Iron Ore']} />
                  <StockInput label="Silver Ore" value={stock.silverOre} onChange={(v) => handleStockChange('silverOre', v)} icon={ORE_ICONS['Silver Ore']} />
                  <StockInput label="Gold Ore" value={stock.goldOre} onChange={(v) => handleStockChange('goldOre', v)} icon={ORE_ICONS['Gold Ore']} />
                  <StockInput label="Adamant Ore" value={stock.adamantiumOre} onChange={(v) => handleStockChange('adamantiumOre', v)} icon={ORE_ICONS['Adamantium Ore']} />
                  <StockInput label="Dragon Ore" value={stock.dragonGlassOre} onChange={(v) => handleStockChange('dragonGlassOre', v)} icon={ORE_ICONS['Dragon Glass Ore']} />
                </div>
                <div className="h-px bg-gradient-to-r from-transparent via-[#d4af37]/30 to-transparent my-10" />
                <div className="grid grid-cols-2 gap-5">
                  <StockInput label="Copper" value={stock.copperIngot} onChange={(v) => handleStockChange('copperIngot', v)} icon="🧱" />
                  <StockInput label="Iron" value={stock.ironIngot} onChange={(v) => handleStockChange('ironIngot', v)} icon="⚔️" />
                  <StockInput label="Silver" value={stock.silverIngot} onChange={(v) => handleStockChange('silverIngot', v)} icon="🪙" />
                  <StockInput label="Gold" value={stock.goldIngot} onChange={(v) => handleStockChange('goldIngot', v)} icon="👑" />
                  <StockInput label="Adamant" value={stock.adamantiumIngot} onChange={(v) => handleStockChange('adamantiumIngot', v)} icon="💎" />
                  <StockInput label="Dragon" value={stock.dragonGlassIngot} onChange={(v) => handleStockChange('dragonGlassIngot', v)} icon="🔮" />
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8">
              {RECIPES.map((recipe) => {
                const max = calculateMaxIngots(recipe.id, stock);
                return (
                  <div key={recipe.id} className="group bg-[#1a2416]/60 rounded-3xl border-2 border-[#3a5a40]/50 overflow-hidden hover:border-[#d4af37]/60 transition-all duration-500 shadow-2xl hover:-translate-y-2 relative">
                    <div className="absolute top-2 right-2 text-xl opacity-10 group-hover:opacity-30 transition-opacity">🍃</div>
                    <div className="p-8">
                      <div className="flex items-center space-x-6 mb-8">
                        <div className="w-[90px] h-[90px] bg-[#0d1109] rounded-2xl flex items-center justify-center border-2 border-[#d4af37]/30 shadow-2xl group-hover:scale-110 transition-transform overflow-hidden relative">
                          <div className="absolute inset-0 bg-gradient-to-tr from-emerald-900/20 to-transparent"></div>
                          <img src={cloudSkins[recipe.id] || recipe.image} alt={recipe.name} className="w-full h-full object-cover relative z-10" />
                        </div>
                        <div>
                          <h3 className={`text-2xl font-medieval font-bold ${recipe.color} tracking-tight drop-shadow-md`}>{recipe.name}</h3>
                          <div className="text-[12px] text-[#a3b18a] uppercase font-bold flex items-center tracking-widest mt-2 font-medieval">{recipe.requirements.oreType} <span className="ml-2">{ORE_ICONS[recipe.requirements.oreType]}</span></div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-10 text-center uppercase tracking-widest font-bold text-[10px] font-medieval">
                         <div className="bg-[#0d1109]/60 p-4 rounded-xl border border-[#3a5a40]/50 shadow-inner">
                            <div className="text-[#a3b18a] mb-1">Fuel Needed</div>
                            <div className="text-base font-serif-fantasy text-[#e2d1c3]">{(recipe.requirements.coal * (max || 1)).toLocaleString()}</div>
                         </div>
                         <div className="bg-[#0d1109]/60 p-4 rounded-xl border border-[#3a5a40]/50 shadow-inner">
                            <div className="text-[#a3b18a] mb-1">Ore Needed</div>
                            <div className="text-base font-serif-fantasy text-[#e2d1c3]">{(recipe.requirements.ore * (max || 1)).toLocaleString()}</div>
                         </div>
                      </div>
                      <div className="bg-gradient-to-br from-[#0d1109]/80 to-[#1a2416]/80 p-8 rounded-2xl border-2 border-[#3a5a40]/30 text-center relative overflow-hidden group-hover:border-[#d4af37]/40 transition-all">
                        <div className="absolute -bottom-4 -left-4 text-4xl opacity-5">🌿</div>
                        <span className="block text-[11px] uppercase tracking-[0.4em] text-[#a3b18a] mb-3 font-bold font-medieval">Potential Forge Yield</span>
                        <span className={`text-6xl font-medieval font-bold ${max > 0 ? 'text-[#d4af37] drop-shadow-[0_0_20px_rgba(212,175,55,0.5)]' : 'text-[#3a5a40]'}`}>{max.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'marketplace' && (
          <div className="space-y-12 animate-in fade-in duration-700">
            {(userRole === 'admin' || userRole === 'pro') && (
              <div className={`bg-[#2d241e]/40 border-2 ${userRole === 'admin' ? 'border-amber-500/20 shadow-amber-900/20' : 'border-purple-500/20 shadow-purple-900/20'} p-12 rounded-2xl max-w-4xl mx-auto backdrop-blur-sm shadow-2xl relative overflow-hidden`}>
                <h2 className="text-3xl font-medieval font-bold mb-10 flex items-center relative text-white"><span className={`mr-5 p-4 ${userRole === 'admin' ? 'bg-amber-500/20 text-amber-400' : 'bg-purple-500/20 text-purple-400'} rounded-xl shadow-2xl`}>📜</span> SCROLL OF TRADE</h2>
                <form onSubmit={handleListingSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-10 relative">
                  <div className="space-y-8">
                    <div>
                      <label className="block text-[10px] font-bold text-[#8b7355] uppercase tracking-widest mb-3 ml-2 font-medieval">Registry Search</label>
                      <div className="relative">
                          <input type="text" placeholder="Search the ledger..." className="w-full bg-[#1a120b] border-2 border-[#4a3728] rounded-xl px-7 py-5 focus:outline-none focus:border-[#d4af37] transition-all text-sm font-bold" value={newListing.searchQuery} onChange={(e) => setNewListing({...newListing, searchQuery: e.target.value})} />
                          {newListing.searchQuery && (
                              <div className="absolute top-full left-0 right-0 bg-[#2d241e] border-2 border-[#4a3728] rounded-xl mt-3 z-50 max-h-64 overflow-y-auto shadow-2xl p-3 space-y-2 backdrop-blur-xl">
                                  {filteredDatabase.map(item => (
                                      <button key={item.id} type="button" onClick={() => setNewListing({...newListing, templateId: item.id, searchQuery: item.name})} className="w-full flex items-center space-x-4 p-4 hover:bg-[#1a120b] rounded-lg transition-colors text-left group">
                                          <img src={item.icon_url} className="w-10 h-10 object-contain bg-[#1a120b] rounded-lg border border-[#4a3728]" alt="icon" />
                                          <span className="text-sm font-bold group-hover:text-[#d4af37] transition-colors">{item.name}</span>
                                      </button>
                                  ))}
                              </div>
                          )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#8b7355] uppercase tracking-widest mb-3 ml-2 font-medieval">Asking Price</label>
                      <input type="text" placeholder="e.g. 100 Gold Coins" className="w-full bg-[#1a120b] border-2 border-[#4a3728] rounded-xl px-7 py-5 focus:outline-none focus:border-[#d4af37] transition-all text-sm font-bold" value={newListing.price} onChange={(e) => setNewListing({...newListing, price: e.target.value})} />
                    </div>
                  </div>
                  <div className="space-y-8">
                    <div>
                      <label className="block text-[10px] font-bold text-[#8b7355] uppercase tracking-widest mb-3 ml-2 font-medieval">Description</label>
                      <textarea placeholder="Write your terms..." className="w-full bg-[#1a120b] border-2 border-[#4a3728] rounded-xl px-7 py-5 h-[142px] focus:outline-none focus:border-[#d4af37] transition-all text-sm resize-none font-medium" value={newListing.description} onChange={(e) => setNewListing({...newListing, description: e.target.value})}></textarea>
                    </div>
                    <button type="submit" disabled={isSyncing} className={`w-full py-6 rounded-xl font-medieval font-extrabold tracking-widest text-xs transition-all shadow-2xl ${userRole === 'admin' ? 'bg-amber-700 hover:bg-amber-600 text-white' : 'bg-purple-800 hover:bg-purple-700 text-white'} disabled:opacity-50 uppercase`}>
                      {isSyncing ? 'SEALING...' : 'POST TO BOARD'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
              {saleItems.map(item => (
                <div key={item.id} className="group bg-[#2d241e]/40 border border-[#4a3728]/60 rounded-2xl overflow-hidden hover:border-[#d4af37]/30 transition-all flex flex-col hover:shadow-2xl">
                  <div className="p-10 flex items-start space-x-6">
                    <div className="w-[72px] h-[72px] bg-[#1a120b] rounded-xl flex items-center justify-center border-2 border-[#4a3728] shadow-2xl flex-shrink-0 overflow-hidden"><img src={item.image_url} alt={item.name} className="w-full h-full object-cover" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <h3 className="text-2xl font-medieval font-bold truncate text-white tracking-tight">{item.name}</h3>
                        {item.is_pro && <div className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-[0_0_12px_purple] mt-2 animate-pulse"></div>}
                      </div>
                      <div className="text-[#d4af37] font-serif-fantasy font-bold text-lg mt-2 tracking-tighter">{item.price}</div>
                    </div>
                  </div>
                  <div className="px-10 pb-10 pt-2 flex-1"><div className="bg-[#1a120b]/40 rounded-xl p-6 border border-[#4a3728]/40 h-full text-[#8b7355] text-xs italic leading-relaxed line-clamp-4">"{item.description || 'Verified Trade Signal'}"</div></div>
                  <div className="bg-[#1a120b]/80 px-10 py-6 border-t border-[#4a3728]/60 flex items-center justify-between backdrop-blur-sm">
                    <div className="flex items-center space-x-4">
                      <span className="text-[10px] font-bold text-[#e2d1c3] truncate max-w-[140px] uppercase tracking-widest font-medieval">{item.seller}</span>
                    </div>
                    {(userRole === 'admin' || (userRole === 'pro' && item.seller === getUserDisplayName(currentUser))) && (
                        <button onClick={() => handleDeleteAd(item.id)} className="text-[9px] font-bold text-red-500/70 hover:text-red-500 transition-colors uppercase tracking-[0.2em] font-medieval">Revoke</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'assets' && userRole === 'admin' && (
          <div className="space-y-16 pb-24 animate-in fade-in duration-700">
            <div className="bg-[#2d241e]/40 border border-[#4a3728]/50 p-12 rounded-2xl shadow-2xl backdrop-blur-sm">
              <h2 className="text-3xl font-medieval font-bold mb-10 text-amber-500 uppercase tracking-tighter">Master Registry</h2>
              <form onSubmit={(e) => { e.preventDefault(); handleAdminCreateUser(e); }} className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-[#1a120b]/50 p-10 rounded-xl mb-16 border border-[#4a3728]/50">
                  <div className="space-y-4"><label className="text-[10px] font-bold text-[#8b7355] uppercase tracking-[0.2em] ml-2 font-medieval">Clearance (role)</label>
                    <select className="w-full bg-[#1a120b] border-2 border-[#4a3728] rounded-xl px-6 py-5 focus:border-[#d4af37] outline-none text-sm font-bold text-white appearance-none" value={adminNewUser.role} onChange={(e) => setAdminNewUser({...adminNewUser, role: e.target.value})}><option value="pro">Pro Traveler</option><option value="admin">Root Admin</option></select>
                  </div>
                  <div className="space-y-4"><label className="text-[10px] font-bold text-[#8b7355] uppercase tracking-[0.2em] ml-2 font-medieval">Key (key_value)</label>
                    <input type="text" placeholder="Access Code..." className="w-full bg-[#1a120b] border-2 border-[#4a3728] rounded-xl px-6 py-5 focus:border-[#d4af37] outline-none text-sm font-serif-fantasy text-[#d4af37]" value={adminNewUser.key_value} onChange={(e) => setAdminNewUser({...adminNewUser, key_value: e.target.value})} />
                  </div>
                  <div className="md:col-span-2"><button type="submit" disabled={isSyncing} className="w-full bg-amber-700 hover:bg-amber-600 text-white rounded-xl font-medieval font-extrabold py-6 transition-all uppercase tracking-[0.3em] text-xs disabled:opacity-50 shadow-2xl">GRANT ACCESS</button></div>
              </form>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {userRegistry.map(user => (
                  <div key={user.id} className="bg-[#1a120b]/80 p-6 rounded-xl border border-[#4a3728]/60 flex items-center space-x-5 group relative shadow-inner">
                    <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-serif-fantasy text-amber-600 font-bold uppercase mb-1">{user.id}</div>
                        <div className="text-sm font-bold truncate text-[#e2d1c3] uppercase tracking-widest font-medieval">{getUserDisplayName(user)}</div>
                        <div className="text-[9px] font-serif-fantasy text-[#8b7355] uppercase tracking-widest mt-1">{user.role} • {user.key_value}</div>
                    </div>
                    <button onClick={() => handleAdminDeleteUser(user.id)} className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-3 hover:bg-red-500/10 rounded-lg font-bold text-[9px] uppercase font-medieval">Revoke</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-40 pt-16 pb-32 flex flex-col items-center max-w-6xl mx-auto opacity-40">
        <div className="flex flex-wrap justify-center gap-8 mb-16">
          {userRole === 'guest' ? (
            <><button onClick={() => {setLoginType('admin'); setShowLoginModal(true);}} className="px-14 py-6 bg-gradient-to-br from-orange-400 to-yellow-500 rounded-3xl text-slate-950 font-orbitron font-extrabold tracking-[0.3em] text-[10px] hover:scale-110 transition-transform shadow-xl">ROOT ACCESS</button>
              <button onClick={() => {setLoginType('pro'); setShowLoginModal(true);}} className="px-14 py-6 bg-slate-900 border-2 border-purple-500/50 text-purple-400 rounded-3xl font-orbitron font-bold text-[10px] tracking-[0.3em] hover:border-purple-500 transition-all shadow-xl">PRO DEPLOYMENT</button></>
          ) : (
            <button onClick={() => {setUserRole('guest'); setCurrentUser(null); setActiveTab('calculator'); notify("Session purged.");}} className="px-14 py-6 bg-slate-900 border-2 border-rose-500/30 text-rose-500 rounded-3xl font-orbitron font-bold text-[10px] tracking-[0.3em] hover:bg-rose-950 transition-all shadow-2xl">TERMINATE CONNECTION</button>
          )}
        </div>
      </footer>

      {showLoginModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[150] p-6 animate-in fade-in duration-500">
          <div className="bg-[#1a120b] border border-[#4a3728] p-16 rounded-2xl w-full max-w-lg shadow-2xl relative">
            <h2 className={`text-4xl font-medieval font-bold mb-10 text-center tracking-tighter ${loginType === 'admin' ? 'text-amber-500' : 'text-purple-400'}`}>{loginType === 'admin' ? 'MASTER AUTH' : 'PRO SYNC'}</h2>
            
            <form onSubmit={handleLogin} className="space-y-10">
              <div className="space-y-4">
                <div className="flex justify-between items-center ml-3">
                  <label className="text-[10px] font-bold text-[#8b7355] uppercase tracking-[0.3em] font-medieval">Trader Handle (ID)</label>
                </div>
                <input type="text" autoFocus placeholder="e.g. 1d08d1f7-..." className="w-full bg-[#1a120b] border-2 border-[#4a3728] rounded-xl px-8 py-6 text-center font-bold text-white focus:border-[#d4af37] outline-none transition-all tracking-widest text-xs" value={loginInput.handle} onChange={(e) => setLoginInput({...loginInput, handle: e.target.value})} />
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center ml-3">
                  <label className="text-[10px] font-bold text-[#8b7355] uppercase tracking-[0.3em] font-medieval">Cloud Key</label>
                </div>
                <input type="password" placeholder="••••••••" className="w-full bg-[#1a120b] border-2 border-[#4a3728] rounded-xl px-8 py-6 text-center font-serif-fantasy text-2xl focus:border-[#d4af37] outline-none transition-all text-[#d4af37] tracking-[0.4em]" value={loginInput.key} onChange={(e) => setLoginInput({...loginInput, key: e.target.value})} />
              </div>
              
              <div className="space-y-4 pt-6">
                <div className="flex space-x-6">
                  <button type="button" onClick={() => setShowLoginModal(false)} className="flex-1 bg-[#2d241e] py-6 rounded-xl font-bold uppercase tracking-[0.3em] text-[10px] hover:bg-[#4a3728] transition-colors text-[#8b7355] font-medieval">ABORT</button>
                  <button type="submit" disabled={isVerifying} className={`flex-1 ${loginType === 'admin' ? 'bg-amber-700' : 'bg-purple-800'} py-6 rounded-xl font-bold uppercase tracking-[0.3em] text-[10px] text-white disabled:opacity-50 shadow-2xl font-medieval`}>{isVerifying ? 'LINKING...' : 'SYNC IDENTITY'}</button>
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
    cyan: active ? 'bg-[#3a5a40] border-[#d4af37] shadow-[0_0_30px_rgba(212,175,55,0.4)] text-white scale-110' : 'bg-[#1a2416] border-[#3a5a40] text-[#a3b18a] hover:text-[#e2d1c3]',
    purple: active ? 'bg-[#4b0082] border-[#9370db] shadow-[0_0_30px_rgba(147,112,219,0.4)] text-white scale-110' : 'bg-[#1a2416] border-[#3a5a40] text-[#a3b18a] hover:text-[#e2d1c3]',
    amber: active ? 'bg-[#b8860b] border-[#ffd700] shadow-[0_0_30px_rgba(255,215,0,0.4)] text-white scale-110' : 'bg-[#1a2416] border-[#3a5a40] text-[#a3b18a] hover:text-[#e2d1c3]',
  };
  return <button onClick={onClick} className={`px-14 py-5 rounded-full font-bold transition-all border-2 font-medieval text-[14px] tracking-[0.4em] uppercase ${themes[color]} relative overflow-hidden group`}>
    <span className="relative z-10">{label}</span>
    <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
  </button>;
};

interface StockInputProps { label: string; value: number; onChange: (val: string) => void; icon: string; }
const StockInput: React.FC<StockInputProps> = ({ label, value, onChange, icon }) => (
  <div className="space-y-3"><label className="text-[11px] font-bold text-[#a3b18a] uppercase flex items-center tracking-widest ml-1 font-medieval"><span className="mr-2 text-lg drop-shadow-md">{icon}</span> {label}</label>
    <input type="number" min="0" className="w-full bg-[#0d1109]/80 border-2 border-[#3a5a40]/50 rounded-xl px-5 py-4 text-[#e2d1c3] focus:border-[#d4af37] font-serif-fantasy text-lg outline-none transition-all shadow-inner hover:border-[#588157]" value={value === 0 ? '' : value} placeholder="0" onChange={(e) => onChange(e.target.value)} />
  </div>
);

export default App;
