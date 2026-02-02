
import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from 'https://esm.sh/@supabase/supabase-js';
import { RECIPES } from './constants';
import { TabType, Stock, SaleItem, AssetImages, IngotRecipe, UserRole, MarketItemTemplate } from './types';

// --- SUPABASE CONFIGURATION ---
// Ensure these match your project settings
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

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('calculator');
  const [userRole, setUserRole] = useState<UserRole>('guest');
  const [proName, setProName] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginType, setLoginType] = useState<'admin' | 'pro'>('admin');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Database of items allowed to be listed
  const [itemDatabase, setItemDatabase] = useState<MarketItemTemplate[]>([]);
  // Global Marketplace Ads
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);

  // Personal Stock (LocalStorage)
  const [stock, setStock] = useState<Stock>(() => {
    const saved = localStorage.getItem('terrax_stock');
    return saved ? JSON.parse(saved) : {
      coal: 0, copperOre: 0, ironOre: 0, silverOre: 0, goldOre: 0, adamantiumOre: 0, dragonGlassOre: 0,
      copperIngot: 0, ironIngot: 0, silverIngot: 0, goldIngot: 0, adamantiumIngot: 0,
    };
  });

  const [customImages, setCustomImages] = useState<AssetImages>(() => {
    const saved = localStorage.getItem('terrax_assets');
    return saved ? JSON.parse(saved) : {};
  });

  const [newListing, setNewListing] = useState({
    templateId: '',
    price: '',
    description: '',
    searchQuery: ''
  });

  const [adminNewItem, setAdminNewItem] = useState({
    name: '',
    iconFile: null as File | null,
    iconBase64: ''
  });

  // --- DATABASE SYNC LOGIC ---
  
  const fetchGlobalData = async () => {
    setIsSyncing(true);
    try {
      const { data: templates } = await supabase.from('market_templates').select('*').order('name');
      const { data: ads } = await supabase.from('sale_listings').select('*').order('created_at', { ascending: false });
      
      if (templates) setItemDatabase(templates);
      if (ads) setSaleItems(ads);
    } catch (error) {
      console.error("Sync Error:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchGlobalData();
  }, []);

  useEffect(() => {
    localStorage.setItem('terrax_stock', JSON.stringify(stock));
    localStorage.setItem('terrax_assets', JSON.stringify(customImages));
  }, [stock, customImages]);

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

  const handleImageUpload = (id: string, file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setCustomImages(prev => ({ ...prev, [id]: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleAdminFileChange = (file: File | null) => {
    if (!file) {
      setAdminNewItem(prev => ({ ...prev, iconFile: null, iconBase64: '' }));
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setAdminNewItem(prev => ({ ...prev, iconFile: file, iconBase64: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const calculateMaxIngots = (recipeId: string, currentStock: Stock) => {
    const recipe = RECIPES.find(r => r.id === recipeId);
    if (!recipe) return 0;
    const coalPossible = Math.floor(currentStock.coal / recipe.requirements.coal);
    let oreStock = 0;
    switch(recipe.requirements.oreType) {
      case 'Copper Ore': oreStock = currentStock.copperOre; break;
      case 'Iron Ore': oreStock = currentStock.ironOre; break;
      case 'Silver Ore': oreStock = currentStock.silverOre; break;
      case 'Gold Ore': oreStock = currentStock.goldOre; break;
      case 'Adamantium Ore': oreStock = currentStock.adamantiumOre; break;
      case 'Dragon Glass Ore': oreStock = currentStock.dragonGlassOre; break;
    }
    const orePossible = Math.floor(oreStock / recipe.requirements.ore);
    let prevIngotPossible = Infinity;
    if (recipe.requirements.previousIngot) {
      const type = recipe.requirements.previousIngot.type as keyof Stock;
      prevIngotPossible = Math.floor(currentStock[type] / recipe.requirements.previousIngot.amount);
    }
    return Math.max(0, Math.min(coalPossible, orePossible, prevIngotPossible));
  };

  const handleListingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const template = itemDatabase.find(t => t.id === newListing.templateId);
    if (!template || !newListing.price) return;

    setIsSyncing(true);
    const { error } = await supabase.from('sale_listings').insert([{
      templateId: template.id,
      name: template.name,
      price: newListing.price,
      description: newListing.description,
      imageUrl: template.iconUrl,
      seller: userRole === 'admin' ? 'System Admin' : (proName || 'Pro User'),
      isPro: userRole === 'pro',
    }]);

    if (!error) {
      setNewListing({ templateId: '', price: '', description: '', searchQuery: '' });
      fetchGlobalData();
    } else {
      alert("Error posting ad: " + error.message);
    }
    setIsSyncing(false);
  };

  const handleAdminItemAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminNewItem.name || !adminNewItem.iconBase64) {
      alert("Please provide both a name and an icon file.");
      return;
    }

    setIsSyncing(true);
    const { error } = await supabase.from('market_templates').insert([{
      name: adminNewItem.name,
      iconUrl: adminNewItem.iconBase64
    }]);

    if (!error) {
      setAdminNewItem({ name: '', iconFile: null, iconBase64: '' });
      fetchGlobalData();
    } else {
      alert("Error adding item: " + error.message);
    }
    setIsSyncing(false);
  };

  const handleDeleteAd = async (id: string) => {
    setIsSyncing(true);
    await supabase.from('sale_listings').delete().eq('id', id);
    fetchGlobalData();
  };

  const handleDeleteTemplate = async (id: string) => {
    setIsSyncing(true);
    await supabase.from('market_templates').delete().eq('id', id);
    fetchGlobalData();
  };

  // --- DATABASE LOGIN LOGIC ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput) return;

    setIsVerifying(true);
    try {
      // Query the database for a matching key and role
      const { data, error } = await supabase
        .from('authorized_keys')
        .select('*')
        .eq('role', loginType)
        .eq('key_value', passwordInput)
        .single();

      if (error || !data) {
        alert(`Invalid ${loginType} key! Check your Supabase database table 'authorized_keys'.`);
      } else {
        // Success
        setUserRole(loginType);
        if (loginType === 'pro') {
          setProName(nameInput || 'Pro Traveler');
        }
        setShowLoginModal(false);
      }
    } catch (err) {
      console.error("Login verification failed:", err);
      alert("Database connection error. Check your Supabase URL/Key.");
    } finally {
      setIsVerifying(false);
      setPasswordInput('');
      setNameInput('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-inter">
      {/* Header */}
      <header className="max-w-6xl mx-auto mb-12 text-center relative">
        <div className="absolute top-0 right-0 flex items-center space-x-3">
            <button 
                onClick={fetchGlobalData}
                className="text-[10px] font-mono text-cyan-500 hover:text-cyan-400 uppercase tracking-widest bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-500/30 transition-all"
            >
                {isSyncing ? 'Refreshing...' : '↻ Sync Cloud'}
            </button>
            <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-500 animate-pulse' : 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]'}`}></div>
        </div>
        <h1 className="text-6xl font-orbitron font-bold tracking-tighter bg-gradient-to-r from-cyan-400 via-purple-500 to-orange-500 bg-clip-text text-transparent mb-4">
          TERRAX
        </h1>
        <div className="flex justify-center items-center space-x-4 text-slate-400 text-xs font-semibold tracking-widest uppercase">
          <span className="flex items-center">FORGE</span>
          <span className="w-1.5 h-1.5 rounded-full bg-slate-800"></span>
          <span className="flex items-center">MARKET</span>
          {userRole !== 'guest' && (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-slate-800"></span>
              <span className={`${userRole === 'admin' ? 'text-amber-400' : 'text-purple-400'} font-bold`}>
                {userRole === 'admin' ? 'ROOT' : proName}
              </span>
            </>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-6xl mx-auto mb-10 flex justify-center space-x-3">
        <TabButton active={activeTab === 'calculator'} onClick={() => setActiveTab('calculator')} label="Forge" color="cyan" />
        <TabButton active={activeTab === 'marketplace'} onClick={() => setActiveTab('marketplace')} label="Market" color="purple" />
        {userRole === 'admin' && (
          <TabButton active={activeTab === 'assets'} onClick={() => setActiveTab('assets')} label="Config" color="amber" />
        )}
      </div>

      {/* Content */}
      <main className="max-w-6xl mx-auto">
        {activeTab === 'calculator' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Input Section */}
            <div className="bg-slate-900/40 p-8 rounded-3xl border border-slate-800/50 backdrop-blur-xl h-fit sticky top-8 shadow-2xl">
              <h2 className="text-xl font-orbitron font-bold mb-8 flex items-center tracking-widest">
                <span className="mr-3 text-cyan-400 opacity-50">#</span> RESOURCES
              </h2>
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
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-4 text-center text-balance">Forge Results Calculator</h3>
                <div className="grid grid-cols-2 gap-4">
                  <StockInput label="Copper" value={stock.copperIngot} onChange={(v) => handleStockChange('copperIngot', v)} icon="🟧" />
                  <StockInput label="Iron" value={stock.ironIngot} onChange={(v) => handleStockChange('ironIngot', v)} icon="⬜" />
                  <StockInput label="Silver" value={stock.silverIngot} onChange={(v) => handleStockChange('silverIngot', v)} icon="💠" />
                  <StockInput label="Gold" value={stock.goldIngot} onChange={(v) => handleStockChange('goldIngot', v)} icon="📀" />
                  <StockInput label="Adamant" value={stock.adamantiumIngot} onChange={(v) => handleStockChange('adamantiumIngot', v)} icon="💎" />
                </div>
              </div>
            </div>

            {/* Results Section */}
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
              {RECIPES.map((recipe) => {
                const max = calculateMaxIngots(recipe.id, stock);
                return (
                  <div key={recipe.id} className="group bg-slate-900/60 rounded-3xl border border-slate-800/50 overflow-hidden hover:border-cyan-500/40 transition-all duration-500 hover:shadow-[0_0_40px_rgba(34,211,238,0.1)]">
                    <div className="p-6">
                      <div className="flex items-center space-x-5 mb-6">
                        <div className="w-[50px] h-[50px] bg-slate-950 rounded-xl flex items-center justify-center overflow-hidden border border-slate-800 shadow-inner group-hover:scale-105 transition-transform">
                          <img src={customImages[recipe.id] || recipe.image} alt={recipe.name} className="w-full h-full object-contain" />
                        </div>
                        <div>
                          <h3 className={`text-xl font-orbitron font-bold ${recipe.color} tracking-tight`}>{recipe.name}</h3>
                          <div className="text-[9px] text-slate-500 uppercase font-bold flex items-center tracking-widest mt-1">
                            {recipe.requirements.oreType} <span className="ml-2">{ORE_ICONS[recipe.requirements.oreType]}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 mb-8 text-center">
                         <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-800/50">
                            <div className="text-[9px] text-slate-500 uppercase font-bold mb-1">Required Coal</div>
                            <div className="text-sm font-mono text-slate-200">{(recipe.requirements.coal * max).toLocaleString()}</div>
                         </div>
                         <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-800/50">
                            <div className="text-[9px] text-slate-500 uppercase font-bold mb-1">Required Ore</div>
                            <div className="text-sm font-mono text-slate-200">{(recipe.requirements.ore * max).toLocaleString()}</div>
                         </div>
                      </div>

                      <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 p-6 rounded-2xl border border-slate-700/30 text-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-12 h-12 bg-cyan-500/5 rounded-full blur-2xl"></div>
                        <span className="block text-[10px] uppercase tracking-[0.3em] text-slate-500 mb-2 font-bold">Possible Yield</span>
                        <span className={`text-4xl font-orbitron font-bold ${max > 0 ? 'text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.3)]' : 'text-slate-700'}`}>
                          {max.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'marketplace' && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Pro Listing Form */}
            {(userRole === 'admin' || userRole === 'pro') && (
              <div className={`bg-slate-900/40 border-2 ${userRole === 'admin' ? 'border-amber-500/20 shadow-amber-900/10' : 'border-purple-500/20 shadow-purple-900/10'} p-10 rounded-[2.5rem] max-w-4xl mx-auto backdrop-blur-2xl shadow-2xl relative overflow-hidden`}>
                <div className="absolute -top-24 -left-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl"></div>
                <h2 className="text-3xl font-orbitron font-bold mb-8 flex items-center relative">
                  <span className={`mr-4 p-3 ${userRole === 'admin' ? 'bg-amber-500/20 text-amber-400' : 'bg-purple-500/20 text-purple-400'} rounded-2xl shadow-xl`}>📦</span> 
                  {userRole === 'admin' ? 'SYSTEM REGISTER AD' : 'POST TRADER LISTING'}
                </h2>
                <form onSubmit={handleListingSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-8 relative">
                  <div className="space-y-6">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Search Registry</label>
                      <div className="relative group">
                          <input 
                            type="text" 
                            placeholder="Type to search items..."
                            className="w-full bg-slate-950 border-2 border-slate-800 rounded-2xl px-5 py-4 focus:outline-none focus:border-cyan-500 transition-all text-sm group-hover:border-slate-700"
                            value={newListing.searchQuery}
                            onChange={(e) => setNewListing({...newListing, searchQuery: e.target.value})}
                          />
                          {newListing.searchQuery && (
                              <div className="absolute top-full left-0 right-0 bg-slate-900 border-2 border-slate-800 rounded-2xl mt-2 z-50 max-h-60 overflow-y-auto shadow-2xl p-2 space-y-1">
                                  {filteredDatabase.map(item => (
                                      <button 
                                        key={item.id} 
                                        type="button"
                                        onClick={() => setNewListing({...newListing, templateId: item.id, searchQuery: item.name})}
                                        className="w-full flex items-center space-x-3 p-3 hover:bg-slate-800 rounded-xl transition-colors text-left"
                                      >
                                          <img src={item.iconUrl} className="w-8 h-8 object-contain bg-slate-950 rounded" />
                                          <span className="text-sm font-bold">{item.name}</span>
                                      </button>
                                  ))}
                                  {filteredDatabase.length === 0 && <div className="p-4 text-xs text-slate-500 italic">No matches in global registry...</div>}
                              </div>
                          )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Price Offer</label>
                      <input 
                        type="text" 
                        placeholder="e.g. 50k Gold / Coal"
                        className="w-full bg-slate-950 border-2 border-slate-800 rounded-2xl px-5 py-4 focus:outline-none focus:border-cyan-500 transition-all text-sm hover:border-slate-700"
                        value={newListing.price}
                        onChange={(e) => setNewListing({...newListing, price: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Trade Description</label>
                      <textarea 
                        placeholder="Details for other players..."
                        className="w-full bg-slate-950 border-2 border-slate-800 rounded-2xl px-5 py-4 h-[126px] focus:outline-none focus:border-cyan-500 transition-all text-sm resize-none hover:border-slate-700"
                        value={newListing.description}
                        onChange={(e) => setNewListing({...newListing, description: e.target.value})}
                      ></textarea>
                    </div>
                    <button type="submit" disabled={isSyncing} className={`w-full py-5 rounded-2xl font-orbitron font-extrabold tracking-widest text-sm transition-all transform active:scale-[0.98] shadow-2xl ${userRole === 'admin' ? 'bg-amber-600 hover:bg-amber-500 text-slate-950' : 'bg-purple-600 hover:bg-purple-500 text-white'} disabled:opacity-50`}>
                      {isSyncing ? 'SYNCING...' : 'PUBLISH AD'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Ads Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {saleItems.map(item => (
                <div key={item.id} className="group bg-slate-900/40 border border-slate-800/60 rounded-[2rem] overflow-hidden hover:border-cyan-500/30 transition-all duration-500 flex flex-col hover:shadow-2xl hover:-translate-y-1">
                  <div className="p-8 flex items-start space-x-5">
                    <div className="w-[64px] h-[64px] bg-slate-950 rounded-2xl flex items-center justify-center overflow-hidden border-2 border-slate-800 flex-shrink-0 shadow-lg group-hover:border-cyan-500/20 transition-colors">
                      <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <h3 className="text-xl font-orbitron font-bold truncate text-white tracking-tight">{item.name}</h3>
                        {item.isPro && <div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)] mt-2"></div>}
                      </div>
                      <div className="text-cyan-400 font-mono font-bold text-base mt-1 tracking-tight">{item.price}</div>
                    </div>
                  </div>
                  <div className="px-8 pb-8 pt-2 flex-1">
                    <div className="bg-slate-950/30 rounded-2xl p-4 border border-slate-800/30 h-full">
                        <p className="text-slate-400 text-xs italic line-clamp-3 leading-relaxed">"{item.description || 'Global trade advertisement.'}"</p>
                    </div>
                  </div>
                  <div className="bg-slate-950/60 px-8 py-5 border-t border-slate-800/40 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-6 h-6 rounded-lg ${item.isPro ? 'bg-purple-600' : 'bg-slate-700'} flex items-center justify-center text-[10px] font-bold text-white shadow-lg`}>{item.seller[0]}</div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-200 truncate max-w-[100px]">{item.seller}</span>
                        <span className="text-[8px] text-slate-600 uppercase tracking-widest font-bold">Verified Trader</span>
                      </div>
                    </div>
                    {(userRole === 'admin' || (userRole === 'pro' && item.seller === proName)) && (
                        <button 
                            onClick={() => handleDeleteAd(item.id)}
                            className="text-[10px] font-bold text-red-500/50 hover:text-red-500 uppercase transition-colors"
                        >
                            Delete
                        </button>
                    )}
                  </div>
                </div>
              ))}
              {saleItems.length === 0 && !isSyncing && (
                <div className="col-span-full py-32 text-center opacity-30">
                    <div className="text-6xl mb-6">📡</div>
                    <div className="text-slate-600 font-orbitron text-sm tracking-[0.4em] uppercase">No global signals detected...</div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'assets' && userRole === 'admin' && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
            <div className="bg-slate-900/40 border border-slate-800/50 p-10 rounded-[2.5rem] shadow-2xl backdrop-blur-xl">
              <h2 className="text-3xl font-orbitron font-bold mb-8 text-amber-400 uppercase tracking-tighter">Global Item Registry</h2>
              <p className="text-slate-400 mb-10 text-sm max-w-2xl leading-relaxed">Administrator Access: Items registered here are synchronized with the Supabase database for all authorized players.</p>
              
              <div className="bg-slate-950/50 p-8 rounded-3xl border border-slate-800/50 mb-12">
                <form onSubmit={handleAdminItemAdd} className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">New Item Name</label>
                    <input 
                      type="text" placeholder="e.g. Dragon Scales" 
                      className="w-full bg-slate-900 border-2 border-slate-800 rounded-2xl px-5 py-4 focus:border-amber-500 outline-none text-sm transition-all"
                      value={adminNewItem.name}
                      onChange={(e) => setAdminNewItem({...adminNewItem, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Icon Upload</label>
                    <label className="flex items-center justify-center w-full h-[58px] bg-slate-900 border-2 border-slate-800 rounded-2xl cursor-pointer hover:border-amber-500 transition-all text-xs text-slate-400 font-bold overflow-hidden relative group">
                      <input 
                        type="file" className="hidden" accept="image/*"
                        onChange={(e) => handleAdminFileChange(e.target.files ? e.target.files[0] : null)} 
                      />
                      {adminNewItem.iconFile ? (
                        <div className="flex items-center space-x-3 px-4">
                          <img src={adminNewItem.iconBase64} alt="preview" className="w-10 h-10 object-contain rounded-lg shadow-xl" />
                          <span className="truncate max-w-[120px] font-mono text-[10px]">{adminNewItem.iconFile.name}</span>
                        </div>
                      ) : (
                        <span>BROWSE LOCAL DISK</span>
                      )}
                    </label>
                  </div>
                  <div className="flex items-end">
                    <button type="submit" disabled={isSyncing} className="w-full bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-2xl font-orbitron font-extrabold py-4 transition-all uppercase tracking-widest text-xs shadow-2xl shadow-amber-900/40 transform active:scale-95 disabled:opacity-50">
                      REGISTER TO CLOUD
                    </button>
                  </div>
                </form>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {itemDatabase.map(item => (
                  <div key={item.id} className="bg-slate-950/80 p-5 rounded-2xl border border-slate-800/60 flex items-center space-x-4 group relative hover:border-amber-500/30 transition-colors">
                    <div className="w-12 h-12 rounded-xl overflow-hidden border-2 border-slate-800 flex-shrink-0 bg-slate-900 shadow-inner">
                      <img src={item.iconUrl} alt={item.name} className="w-full h-full object-contain" />
                    </div>
                    <span className="text-xs font-bold truncate flex-1 text-slate-200">{item.name}</span>
                    <button 
                      onClick={() => handleDeleteTemplate(item.id)} 
                      className="w-6 h-6 flex items-center justify-center rounded-full bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white text-xs font-bold transition-all opacity-0 group-hover:opacity-100"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900/40 border border-slate-800/50 p-10 rounded-[2.5rem] backdrop-blur-xl">
              <h2 className="text-3xl font-orbitron font-bold mb-10 text-amber-400 uppercase tracking-tighter text-center">Local Forge Skins</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">
                {RECIPES.map(recipe => (
                  <div key={recipe.id} className="bg-slate-950 p-8 rounded-3xl border border-slate-800/50 flex flex-col items-center space-y-6 shadow-inner">
                    <div className="w-[80px] h-[80px] bg-slate-900 rounded-2xl flex items-center justify-center border-2 border-slate-800 overflow-hidden shadow-2xl">
                      <img src={customImages[recipe.id] || recipe.image} alt={recipe.name} className="w-full h-full object-contain" />
                    </div>
                    <div className={`text-xl font-orbitron font-bold ${recipe.color} tracking-tight`}>{recipe.name}</div>
                    <label className="w-full cursor-pointer bg-slate-800 hover:bg-slate-700 py-4 rounded-2xl text-center text-[10px] font-bold transition-all border border-slate-700 shadow-lg tracking-widest uppercase">
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(recipe.id, e.target.files ? e.target.files[0] : null)} />
                      Override Icon
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Login Trigger */}
      <footer className="mt-32 border-t border-slate-900/50 pt-16 pb-20 flex flex-col items-center max-w-6xl mx-auto">
        <div className="flex flex-wrap justify-center gap-6 mb-12">
          {userRole === 'guest' ? (
            <>
              <button 
                onClick={() => {setLoginType('admin'); setShowLoginModal(true);}}
                className="group relative px-12 py-5 bg-gradient-to-br from-orange-400 via-orange-500 to-yellow-500 rounded-3xl text-slate-950 font-orbitron font-extrabold tracking-[0.2em] text-xs transition-all hover:scale-110 active:scale-95 shadow-[0_15px_40px_rgba(249,115,22,0.3)] overflow-hidden"
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_white_0%,_transparent_100%)] opacity-0 group-hover:opacity-20 transition-opacity"></div>
                <span className="relative z-10 flex items-center justify-center">🛡️ SECURE ADMIN</span>
              </button>
              <button 
                onClick={() => {setLoginType('pro'); setShowLoginModal(true);}}
                className="px-12 py-5 bg-slate-900 border-2 border-purple-500/50 text-purple-400 rounded-3xl font-orbitron font-bold text-xs tracking-[0.2em] transition-all hover:bg-purple-900/20 active:scale-95 shadow-xl hover:border-purple-500"
              >
                PRO ACTIVATION
              </button>
            </>
          ) : (
            <button 
                onClick={() => {setUserRole('guest'); setActiveTab('calculator');}} 
                className="px-12 py-5 bg-slate-900 border-2 border-red-500/30 text-red-500 rounded-3xl font-orbitron font-bold text-xs tracking-[0.2em] transition-all hover:bg-red-950 hover:border-red-500 shadow-2xl"
            >
              TERMINATE SESSION
            </button>
          )}
        </div>
        <p className="text-slate-500 text-[10px] font-orbitron tracking-[0.5em] uppercase opacity-40">Connected to Cloud Infrastructure</p>
      </footer>

      {/* Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-2xl flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-800 p-12 rounded-[3rem] w-full max-w-md shadow-2xl relative overflow-hidden">
            <div className={`absolute top-0 left-0 right-0 h-1.5 ${loginType === 'admin' ? 'bg-orange-500' : 'bg-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.5)]'}`}></div>
            <h2 className={`text-3xl font-orbitron font-bold mb-10 text-center ${loginType === 'admin' ? 'text-orange-400' : 'text-purple-400'}`}>
              {loginType === 'admin' ? 'SYSTEM KEY' : 'PRO ACTIVATION'}
            </h2>
            <form onSubmit={handleLogin} className="space-y-8">
              {loginType === 'pro' && (
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] ml-2">Display Name</label>
                  <input type="text" placeholder="Your Alias..." className="w-full bg-slate-950 border-2 border-slate-800 rounded-2xl px-6 py-5 focus:border-purple-500 outline-none transition-all text-center font-bold tracking-tight" value={nameInput} onChange={(e) => setNameInput(e.target.value)} />
                </div>
              )}
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] ml-2">Access Code</label>
                <div className="relative">
                    <input type="password" autoFocus placeholder="••••••••" className="w-full bg-slate-950 border-2 border-slate-800 rounded-2xl px-6 py-5 focus:border-cyan-500 outline-none transition-all text-center font-mono text-xl" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} />
                    {!isVerifying && passwordInput && <div className="absolute top-1/2 right-4 -translate-y-1/2 text-cyan-500 text-[8px] font-bold uppercase tracking-tighter">Ready</div>}
                </div>
              </div>
              <div className="flex space-x-4 pt-4">
                <button type="button" onClick={() => setShowLoginModal(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 py-5 rounded-2xl font-bold transition-all text-slate-300 uppercase tracking-widest text-[10px]">BACK</button>
                <button type="submit" disabled={isVerifying} className={`flex-1 ${loginType === 'admin' ? 'bg-orange-600 shadow-orange-900/40' : 'bg-purple-600 shadow-purple-900/40'} hover:opacity-90 py-5 rounded-2xl font-bold transition-all shadow-2xl uppercase tracking-widest text-[10px] text-white disabled:opacity-50`}>
                  {isVerifying ? 'VERIFYING...' : 'AUTHENTICATE'}
                </button>
              </div>
            </form>
            <div className="mt-8 text-center">
                <span className="text-[8px] font-orbitron text-slate-600 tracking-widest uppercase flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-2 shadow-[0_0_5px_green]"></span> Cloud Verified
                </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const TabButton = ({ active, onClick, label, color }: { active: boolean, onClick: () => void, label: string, color: 'cyan' | 'purple' | 'amber' }) => {
  const themes = {
    cyan: active ? 'bg-cyan-600 border-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.3)] text-white scale-105' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300',
    purple: active ? 'bg-purple-600 border-purple-400 shadow-[0_0_30px_rgba(168,85,247,0.3)] text-white scale-105' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300',
    amber: active ? 'bg-amber-600 border-amber-400 shadow-[0_0_30px_rgba(251,191,36,0.3)] text-white scale-105' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300',
  };
  return (
    <button onClick={onClick} className={`px-12 py-4 rounded-2xl font-bold transition-all duration-300 border-2 font-orbitron text-[10px] tracking-[0.3em] uppercase ${themes[color]}`}>
      {label}
    </button>
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
    <label className="text-[8px] font-bold text-slate-500 uppercase flex items-center truncate tracking-[0.1em] ml-1">
      <span className="mr-2 text-sm drop-shadow-sm">{icon}</span> {label}
    </label>
    <input
      type="number"
      min="0"
      className="w-full bg-slate-950/80 border-2 border-slate-800/50 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-cyan-500/50 transition-all text-xs font-mono shadow-inner group"
      value={value === 0 ? '' : value}
      placeholder="0"
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

export default App;
