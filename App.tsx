import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from 'https://esm.sh/@supabase/supabase-js';
import { RECIPES } from './constants';
import { TabType, Stock, SaleItem, AssetImages, IngotRecipe, UserRole, MarketItemTemplate, AuthorizedKey, Notification } from './types';

// --- SUPABASE CONFIGURATION ---
const SUPABASE_URL = 'https://kgstbnbsqvxrigsgpslf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtnc3RibmJzcXZ4cmlnc2dwc2xmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwMjcwNTEsImV4cCI6MjA4NTYwMzA1MX0.69-65de7EKEDqFKFqcn585vtre10OcotZFeRYV14pTY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- PRESET AVATAR GALLERY ---
const PRESET_AVATARS = [
  'https://api.dicebear.com/7.x/bottts/svg?seed=TerraX-1',
  'https://api.dicebear.com/7.x/bottts/svg?seed=TerraX-2',
  'https://api.dicebear.com/7.x/bottts/svg?seed=TerraX-3',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
  'https://api.dicebear.com/7.x/identicon/svg?seed=Nova',
  'https://api.dicebear.com/7.x/identicon/svg?seed=Pulse',
  'https://api.dicebear.com/7.x/pixel-art/svg?seed=Pilot',
];

const ORE_ICONS: { [key: string]: string } = {
  'Coal': '⬛',
  'Copper Ore': '🟫',
  'Iron Ore': '🌑',
  'Silver Ore': '💿',
  'Gold Ore': '🟡',
  'Adamantium Ore': '💠',
  'Dragon Glass Ore': '🟣',
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
  
  // UI State
  const [loginInput, setLoginInput] = useState({ handle: '', key: '' });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
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

  const [newListing, setNewListing] = useState({ templateId: '', price: '', description: '', searchQuery: '' });
  const [adminNewItem, setAdminNewItem] = useState({ name: '', iconBase64: '' });
  const [adminNewUser, setAdminNewUser] = useState({ role: 'pro', display_name: '', key_value: '', avatar_url: PRESET_AVATARS[0] });

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

  const filteredDatabase = useMemo(() => itemDatabase.filter(item => 
    item.name.toLowerCase().includes(newListing.searchQuery.toLowerCase())
  ), [itemDatabase, newListing.searchQuery]);

  const handleAvatarFileChange = (file: File | null, callback: (base64: string) => void) => {
    if (!file) return;
    if (file.size > 51200) {
      notify("File too large! Max 50KB.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => callback(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleUpdateProfileAvatar = async (url: string) => {
    if (!currentUser) return;
    setIsSyncing(true);
    const { error } = await supabase.from('authorized_keys').update({ avatar_url: url }).eq('id', currentUser.id);
    if (!error) {
      setCurrentUser({ ...currentUser, avatar_url: url });
      notify("Profile avatar updated!", "success");
      setShowProfileModal(false);
      fetchGlobalData();
    } else notify("Update failed: " + error.message, "error");
    setIsSyncing(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginInput.handle || !loginInput.key) return;
    setIsVerifying(true);
    try {
      const { data, error } = await supabase
        .from('authorized_keys')
        .select('*')
        .eq('role', loginType)
        .eq('display_name', loginInput.handle)
        .eq('key_value', loginInput.key)
        .single();

      if (error || !data) {
        notify("Access Denied: Invalid ID or Password.", "error");
      } else {
        setUserRole(loginType);
        setCurrentUser(data);
        notify(`Welcome back, ${data.display_name}!`, "success");
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
      image_url: template.icon_url, seller: currentUser?.display_name, seller_avatar: currentUser?.avatar_url, is_pro: userRole === 'pro',
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
    if (!adminNewUser.display_name || !adminNewUser.key_value) {
      notify("ID and Key are required for new registry entry.", "error");
      return;
    }
    setIsSyncing(true);
    const { error } = await supabase.from('authorized_keys').insert([{
      role: adminNewUser.role,
      display_name: adminNewUser.display_name.toUpperCase(), // Force normalization
      key_value: adminNewUser.key_value,
      avatar_url: adminNewUser.avatar_url
    }]);
    if (!error) {
      setAdminNewUser({ role: 'pro', display_name: '', key_value: '', avatar_url: PRESET_AVATARS[0] });
      notify("Identity authorized and synchronized.", "success");
      fetchGlobalData();
    } else notify("Auth Registry Sync Failed: " + error.message, "error");
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
      notify("Identity access revoked and purged.", "info");
      fetchGlobalData();
    } else notify("Registry Purge Failed: " + error.message, "error");
    setIsSyncing(false);
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 p-4 md:p-8 font-inter">
      {/* Toast Overlay */}
      <div className="fixed top-8 right-8 z-[200] space-y-4 pointer-events-none">
        {notifications.map(n => (
          <div key={n.id} className={`px-6 py-5 rounded-3xl shadow-2xl border backdrop-blur-3xl animate-in fade-in slide-in-from-right-10 flex items-center space-x-5 pointer-events-auto min-w-[340px] ${
            n.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' :
            n.type === 'error' ? 'bg-rose-500/10 border-rose-500/50 text-rose-400' : 'bg-sky-500/10 border-sky-500/50 text-sky-400'
          }`}>
            <div className={`w-3 h-3 rounded-full ${n.type === 'success' ? 'bg-emerald-500 animate-pulse' : n.type === 'error' ? 'bg-rose-500' : 'bg-sky-500'}`}></div>
            <p className="text-xs font-bold tracking-widest uppercase">{n.message}</p>
          </div>
        ))}
      </div>

      <header className="max-w-6xl mx-auto mb-12 text-center relative pt-8">
        <div className="absolute top-0 right-0 flex items-center space-x-4">
            <button onClick={fetchGlobalData} className="text-[10px] font-orbitron font-bold text-cyan-500 hover:text-cyan-400 uppercase tracking-widest bg-cyan-500/10 px-4 py-2 rounded-2xl border border-cyan-500/30 transition-all">
                {isSyncing ? 'STREAMS ACTIVE...' : 'SYNC CLOUD'}
            </button>
        </div>
        <h1 className="text-7xl font-orbitron font-bold tracking-tighter bg-gradient-to-b from-cyan-300 via-purple-500 to-orange-400 bg-clip-text text-transparent mb-6">TERRAX</h1>
        <div className="flex justify-center items-center space-x-6 text-slate-400 text-[10px] font-bold tracking-[0.3em] uppercase">
          {currentUser && (
            <button onClick={() => setShowProfileModal(true)} className="relative group">
              <img src={currentUser.avatar_url} className="w-10 h-10 rounded-full border-2 border-cyan-500/30 bg-slate-900 shadow-xl group-hover:border-cyan-400 transition-all" alt="avatar" />
              <div className="absolute -bottom-1 -right-1 bg-cyan-500 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <svg className="w-2 h-2 text-slate-950" fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
              </div>
            </button>
          )}
          <span>FORGE</span>
          <span className="w-1.5 h-1.5 rounded-full bg-slate-800"></span>
          <span>MARKET</span>
          {userRole !== 'guest' && (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-slate-800"></span>
              <span className={`${userRole === 'admin' ? 'text-amber-400' : 'text-purple-400'} font-bold`}>{currentUser?.display_name}</span>
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
            <div className="bg-slate-900/30 p-10 rounded-[2.5rem] border border-slate-800/50 backdrop-blur-3xl h-fit sticky top-8 shadow-2xl">
              <h2 className="text-2xl font-orbitron font-bold mb-10 flex items-center tracking-widest text-slate-200"><span className="mr-4 text-cyan-400 opacity-50 text-3xl">/</span> RESOURCES</h2>
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
                <div className="h-px bg-gradient-to-r from-transparent via-slate-800 to-transparent my-10" />
                <div className="grid grid-cols-2 gap-5">
                  <StockInput label="Copper" value={stock.copperIngot} onChange={(v) => handleStockChange('copperIngot', v)} icon="🟧" />
                  <StockInput label="Iron" value={stock.ironIngot} onChange={(v) => handleStockChange('ironIngot', v)} icon="⬜" />
                  <StockInput label="Silver" value={stock.silverIngot} onChange={(v) => handleStockChange('silverIngot', v)} icon="💠" />
                  <StockInput label="Gold" value={stock.goldIngot} onChange={(v) => handleStockChange('goldIngot', v)} icon="📀" />
                  <StockInput label="Adamant" value={stock.adamantiumIngot} onChange={(v) => handleStockChange('adamantiumIngot', v)} icon="💎" />
                  <StockInput label="Dragon" value={stock.dragonGlassIngot} onChange={(v) => handleStockChange('dragonGlassIngot', v)} icon="🟣" />
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8">
              {RECIPES.map((recipe) => {
                const max = calculateMaxIngots(recipe.id, stock);
                return (
                  <div key={recipe.id} className="group bg-slate-900/40 rounded-[2rem] border border-slate-800/60 overflow-hidden hover:border-cyan-500/40 transition-all duration-500 shadow-2xl hover:-translate-y-2">
                    <div className="p-8">
                      <div className="flex items-center space-x-6 mb-8">
                        <div className="w-[64px] h-[64px] bg-slate-950 rounded-2xl flex items-center justify-center border-2 border-slate-800 shadow-2xl group-hover:scale-110 transition-transform">
                          <img src={cloudSkins[recipe.id] || recipe.image} alt={recipe.name} className="w-full h-full object-contain" />
                        </div>
                        <div>
                          <h3 className={`text-2xl font-orbitron font-bold ${recipe.color} tracking-tight`}>{recipe.name}</h3>
                          <div className="text-[10px] text-slate-500 uppercase font-bold flex items-center tracking-widest mt-2">{recipe.requirements.oreType} <span className="ml-2">{ORE_ICONS[recipe.requirements.oreType]}</span></div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-10 text-center uppercase tracking-widest font-bold text-[9px]">
                         <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/50">
                            <div className="text-slate-500 mb-1">Coal Req</div>
                            <div className="text-sm font-mono text-slate-200">{(recipe.requirements.coal * (max || 1)).toLocaleString()}</div>
                         </div>
                         <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/50">
                            <div className="text-slate-500 mb-1">Ore Req</div>
                            <div className="text-sm font-mono text-slate-200">{(recipe.requirements.ore * (max || 1)).toLocaleString()}</div>
                         </div>
                      </div>
                      <div className="bg-gradient-to-br from-slate-900/80 to-slate-950/80 p-8 rounded-3xl border border-slate-700/30 text-center relative overflow-hidden group-hover:border-cyan-500/20 transition-all">
                        <span className="block text-[10px] uppercase tracking-[0.4em] text-slate-500 mb-3 font-bold">Estimated Forge Yield</span>
                        <span className={`text-5xl font-orbitron font-bold ${max > 0 ? 'text-cyan-400 drop-shadow-[0_0_20px_rgba(34,211,238,0.4)]' : 'text-slate-800'}`}>{max.toLocaleString()}</span>
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
              <div className={`bg-slate-900/40 border-2 ${userRole === 'admin' ? 'border-amber-500/20 shadow-amber-900/20' : 'border-purple-500/20 shadow-purple-900/20'} p-12 rounded-[3.5rem] max-w-4xl mx-auto backdrop-blur-3xl shadow-2xl relative overflow-hidden`}>
                <h2 className="text-3xl font-orbitron font-bold mb-10 flex items-center relative text-white"><span className={`mr-5 p-4 ${userRole === 'admin' ? 'bg-amber-500/20 text-amber-400' : 'bg-purple-500/20 text-purple-400'} rounded-[1.5rem] shadow-2xl`}>📡</span> CLOUD BROADCAST</h2>
                <form onSubmit={handleListingSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-10 relative">
                  <div className="space-y-8">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 ml-2">Cloud Registry Search</label>
                      <div className="relative">
                          <input type="text" placeholder="Filter item registry..." className="w-full bg-slate-950 border-2 border-slate-800 rounded-3xl px-7 py-5 focus:outline-none focus:border-cyan-500 transition-all text-sm font-bold" value={newListing.searchQuery} onChange={(e) => setNewListing({...newListing, searchQuery: e.target.value})} />
                          {newListing.searchQuery && (
                              <div className="absolute top-full left-0 right-0 bg-slate-900 border-2 border-slate-800 rounded-3xl mt-3 z-50 max-h-64 overflow-y-auto shadow-2xl p-3 space-y-2 backdrop-blur-xl">
                                  {filteredDatabase.map(item => (
                                      <button key={item.id} type="button" onClick={() => setNewListing({...newListing, templateId: item.id, searchQuery: item.name})} className="w-full flex items-center space-x-4 p-4 hover:bg-slate-800 rounded-[1.25rem] transition-colors text-left group">
                                          <img src={item.icon_url} className="w-10 h-10 object-contain bg-slate-950 rounded-xl border border-slate-800" alt="icon" />
                                          <span className="text-sm font-bold group-hover:text-cyan-400 transition-colors">{item.name}</span>
                                      </button>
                                  ))}
                              </div>
                          )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 ml-2">Trade Offer</label>
                      <input type="text" placeholder="e.g. 10B Gold" className="w-full bg-slate-950 border-2 border-slate-800 rounded-3xl px-7 py-5 focus:outline-none focus:border-cyan-500 transition-all text-sm font-bold" value={newListing.price} onChange={(e) => setNewListing({...newListing, price: e.target.value})} />
                    </div>
                  </div>
                  <div className="space-y-8">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 ml-2">Memo</label>
                      <textarea placeholder="Trade conditions..." className="w-full bg-slate-950 border-2 border-slate-800 rounded-3xl px-7 py-5 h-[142px] focus:outline-none focus:border-cyan-500 transition-all text-sm resize-none font-medium" value={newListing.description} onChange={(e) => setNewListing({...newListing, description: e.target.value})}></textarea>
                    </div>
                    <button type="submit" disabled={isSyncing} className={`w-full py-6 rounded-3xl font-orbitron font-extrabold tracking-widest text-xs transition-all shadow-2xl ${userRole === 'admin' ? 'bg-amber-600 hover:bg-amber-500 text-slate-950' : 'bg-purple-600 hover:bg-purple-500 text-white'} disabled:opacity-50 uppercase`}>
                      {isSyncing ? 'LINKING...' : 'INITIALIZE BROADCAST'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
              {saleItems.map(item => (
                <div key={item.id} className="group bg-slate-900/40 border border-slate-800/60 rounded-[2.5rem] overflow-hidden hover:border-cyan-500/30 transition-all flex flex-col hover:shadow-2xl">
                  <div className="p-10 flex items-start space-x-6">
                    <div className="w-[72px] h-[72px] bg-slate-950 rounded-2xl flex items-center justify-center border-2 border-slate-800 shadow-2xl flex-shrink-0"><img src={item.image_url} alt={item.name} className="w-full h-full object-contain" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <h3 className="text-2xl font-orbitron font-bold truncate text-white tracking-tight">{item.name}</h3>
                        {item.is_pro && <div className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-[0_0_12px_purple] mt-2 animate-pulse"></div>}
                      </div>
                      <div className="text-cyan-400 font-mono font-bold text-lg mt-2 tracking-tighter">{item.price}</div>
                    </div>
                  </div>
                  <div className="px-10 pb-10 pt-2 flex-1"><div className="bg-slate-950/40 rounded-3xl p-6 border border-slate-800/40 h-full text-slate-400 text-xs italic leading-relaxed line-clamp-4">"{item.description || 'Verified Trade Signal'}"</div></div>
                  <div className="bg-slate-950/80 px-10 py-6 border-t border-slate-800/60 flex items-center justify-between backdrop-blur-xl">
                    <div className="flex items-center space-x-4">
                      {item.seller_avatar && <img src={item.seller_avatar} className="w-8 h-8 rounded-full border-2 border-slate-800 bg-slate-900 shadow-xl" alt="seller" />}
                      <span className="text-[10px] font-bold text-slate-200 truncate max-w-[140px] uppercase tracking-widest">{item.seller}</span>
                    </div>
                    {(userRole === 'admin' || (userRole === 'pro' && item.seller === currentUser?.display_name)) && (
                        <button onClick={() => handleDeleteAd(item.id)} className="text-[9px] font-bold text-rose-500/50 hover:text-rose-500 transition-colors uppercase tracking-[0.2em]">Terminate</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'assets' && userRole === 'admin' && (
          <div className="space-y-16 pb-24 animate-in fade-in duration-700">
            <div className="bg-slate-900/40 border border-slate-800/50 p-12 rounded-[3.5rem] shadow-2xl backdrop-blur-3xl">
              <h2 className="text-3xl font-orbitron font-bold mb-10 text-amber-400 uppercase tracking-tighter">Authorized Registry</h2>
              <form onSubmit={(e) => { e.preventDefault(); handleAdminCreateUser(e); }} className="grid grid-cols-1 md:grid-cols-4 gap-8 bg-slate-950/50 p-10 rounded-[2.5rem] mb-16 border border-slate-800/50">
                  <div className="space-y-4"><label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] ml-2">Clearance</label>
                    <select className="w-full bg-slate-900 border-2 border-slate-800 rounded-3xl px-6 py-5 focus:border-amber-500 outline-none text-sm font-bold text-white appearance-none" value={adminNewUser.role} onChange={(e) => setAdminNewUser({...adminNewUser, role: e.target.value})}><option value="pro">Pro Traveler</option><option value="admin">Root Admin</option></select>
                  </div>
                  <div className="space-y-4"><label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] ml-2">ID (Trader Handle)</label>
                    <input type="text" placeholder="e.g. ATLAS-01" className="w-full bg-slate-900 border-2 border-slate-800 rounded-3xl px-6 py-5 focus:border-amber-500 outline-none text-sm font-bold uppercase" value={adminNewUser.display_name} onChange={(e) => setAdminNewUser({...adminNewUser, display_name: e.target.value.toUpperCase()})} />
                  </div>
                  <div className="space-y-4"><label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] ml-2">Cloud Key (Password)</label>
                    <input type="text" placeholder="Key Value..." className="w-full bg-slate-900 border-2 border-slate-800 rounded-3xl px-6 py-5 focus:border-amber-500 outline-none text-sm font-mono text-cyan-400" value={adminNewUser.key_value} onChange={(e) => setAdminNewUser({...adminNewUser, key_value: e.target.value})} />
                  </div>
                  <div className="flex flex-col space-y-4"><label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] ml-2">Initial Identity</label>
                    <div className="flex items-center space-x-3 bg-slate-900 border-2 border-slate-800 rounded-3xl p-2">
                        <img src={adminNewUser.avatar_url} className="w-10 h-10 rounded-full bg-slate-950 border border-slate-700" alt="avatar" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Synced Preset</span>
                    </div>
                  </div>
                  <div className="md:col-span-4"><button type="submit" disabled={isSyncing} className="w-full bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-3xl font-orbitron font-extrabold py-6 transition-all uppercase tracking-[0.3em] text-xs disabled:opacity-50 shadow-2xl">AUTHORIZE CLOUD PROFILE</button></div>
              </form>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {userRegistry.map(user => (
                  <div key={user.id} className="bg-slate-950/80 p-6 rounded-[2rem] border border-slate-800/60 flex items-center space-x-5 group relative shadow-inner">
                    <img src={user.avatar_url} className="w-12 h-12 rounded-full border-2 border-slate-800 shadow-xl bg-slate-900" alt="avatar" />
                    <div className="flex-1 min-w-0"><div className="text-sm font-bold truncate text-slate-100 uppercase tracking-widest">{user.display_name}</div><div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mt-1">{user.role} • {user.key_value}</div></div>
                    <button onClick={() => handleAdminDeleteUser(user.id)} className="text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity p-3 hover:bg-rose-500/10 rounded-2xl font-bold">REVOKE</button>
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

      {/* Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-[100px] flex items-center justify-center z-[150] p-6 animate-in fade-in duration-500">
          <div className="bg-[#0f172a] border border-slate-800 p-16 rounded-[4rem] w-full max-w-lg shadow-2xl relative">
            <h2 className={`text-4xl font-orbitron font-bold mb-14 text-center tracking-tighter ${loginType === 'admin' ? 'text-amber-400' : 'text-purple-400'}`}>{loginType === 'admin' ? 'ROOT AUTH' : 'PRO SYNC'}</h2>
            <form onSubmit={handleLogin} className="space-y-10">
              <div className="space-y-4"><label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] ml-3">Trader Handle (ID)</label>
                <input type="text" autoFocus placeholder="e.g. ATLAS-117" className="w-full bg-slate-950 border-2 border-slate-800 rounded-3xl px-8 py-6 text-center font-bold text-white focus:border-cyan-500 outline-none transition-all tracking-widest uppercase" value={loginInput.handle} onChange={(e) => setLoginInput({...loginInput, handle: e.target.value.toUpperCase()})} />
              </div>
              <div className="space-y-4"><label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] ml-3">Cloud Key (Password)</label>
                <input type="password" placeholder="••••••••" className="w-full bg-slate-950 border-2 border-slate-800 rounded-3xl px-8 py-6 text-center font-mono text-2xl focus:border-cyan-500 outline-none transition-all text-cyan-400 tracking-[0.4em]" value={loginInput.key} onChange={(e) => setLoginInput({...loginInput, key: e.target.value})} />
              </div>
              <div className="flex space-x-6 pt-6">
                <button type="button" onClick={() => setShowLoginModal(false)} className="flex-1 bg-slate-800 py-6 rounded-3xl font-bold uppercase tracking-[0.3em] text-[10px] hover:bg-slate-700 transition-colors text-slate-400">ABORT</button>
                <button type="submit" disabled={isVerifying} className={`flex-1 ${loginType === 'admin' ? 'bg-amber-600' : 'bg-purple-600'} py-6 rounded-3xl font-bold uppercase tracking-[0.3em] text-[10px] text-white disabled:opacity-50 shadow-2xl`}>{isVerifying ? 'LINKING...' : 'SYNC IDENTITY'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Profile Sync Modal (Avatar Selector) */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-[60px] flex items-center justify-center z-[160] p-6 animate-in fade-in duration-300">
          <div className="bg-[#0f172a] border border-slate-800 p-12 rounded-[3.5rem] w-full max-w-2xl shadow-2xl relative overflow-hidden">
            <h2 className="text-3xl font-orbitron font-bold mb-10 text-center tracking-tighter text-cyan-400">PROFILE SYNC GALLERY</h2>
            <div className="grid grid-cols-4 gap-6 mb-12">
              {PRESET_AVATARS.map((url, i) => (
                <button key={i} onClick={() => handleUpdateProfileAvatar(url)} className={`relative p-2 rounded-2xl border-2 transition-all hover:scale-105 ${currentUser?.avatar_url === url ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-800 hover:border-slate-600'}`}>
                  <img src={url} className="w-full aspect-square rounded-xl" alt="preset" />
                  {currentUser?.avatar_url === url && <div className="absolute top-1 right-1 bg-cyan-500 rounded-full p-1"><svg className="w-2 h-2 text-slate-950" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg></div>}
                </button>
              ))}
              {/* Custom Upload Option */}
              <label className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-700 p-2 cursor-pointer hover:border-cyan-500/50 transition-all aspect-square group">
                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleAvatarFileChange(e.target.files ? e.target.files[0] : null, handleUpdateProfileAvatar)} />
                <span className="text-[10px] font-bold text-slate-500 group-hover:text-cyan-400 text-center uppercase tracking-widest">Upload Custom<br/><span className="text-[8px] opacity-50">(MAX 50KB)</span></span>
              </label>
            </div>
            <button onClick={() => setShowProfileModal(false)} className="w-full bg-slate-800 py-5 rounded-3xl font-bold uppercase tracking-[0.3em] text-[10px] hover:bg-slate-700 transition-colors">CLOSE DEEP-SYNC</button>
          </div>
        </div>
      )}
    </div>
  );
};

const TabButton = ({ active, onClick, label, color }: { active: boolean, onClick: () => void, label: string, color: 'cyan' | 'purple' | 'amber' }) => {
  const themes = {
    cyan: active ? 'bg-cyan-600 border-cyan-400 shadow-[0_0_40px_rgba(34,211,238,0.3)] text-white scale-110' : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-200',
    purple: active ? 'bg-purple-600 border-purple-400 shadow-[0_0_40px_rgba(168,85,247,0.3)] text-white scale-110' : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-200',
    amber: active ? 'bg-amber-600 border-amber-400 shadow-[0_0_40px_rgba(251,191,36,0.3)] text-white scale-110' : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-200',
  };
  return <button onClick={onClick} className={`px-14 py-5 rounded-[1.5rem] font-bold transition-all border-2 font-orbitron text-[10px] tracking-[0.4em] uppercase ${themes[color]}`}>{label}</button>;
};

interface StockInputProps { label: string; value: number; onChange: (val: string) => void; icon: string; }
const StockInput: React.FC<StockInputProps> = ({ label, value, onChange, icon }) => (
  <div className="space-y-3"><label className="text-[9px] font-bold text-slate-500 uppercase flex items-center tracking-widest ml-1"><span className="mr-2 text-base drop-shadow-md">{icon}</span> {label}</label>
    <input type="number" min="0" className="w-full bg-slate-950/80 border-2 border-slate-800/50 rounded-2xl px-5 py-4 text-slate-200 focus:border-cyan-500 font-mono text-xs outline-none transition-all shadow-inner hover:border-slate-700" value={value === 0 ? '' : value} placeholder="0" onChange={(e) => onChange(e.target.value)} />
  </div>
);

export default App;
