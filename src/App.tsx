import React, { useState, useEffect, useCallback } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  LabelList
} from 'recharts';
import { 
  Upload, 
  TrendingUp, 
  IndianRupee, 
  Calendar, 
  Plus, 
  Trash2, 
  Loader2,
  FileText,
  X,
  CheckCircle2,
  AlertTriangle,
  Eraser
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeTradingData, processBotQuery, DailyStats } from './services/geminiService';
import { format, parseISO, isValid } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const safeFormatDate = (dateStr: string, formatStr: string) => {
  try {
    const date = parseISO(dateStr);
    if (!isValid(date)) return 'Invalid Date';
    return format(date, formatStr);
  } catch (e) {
    return 'Invalid Date';
  }
};

interface PendingFile {
  id: string;
  file: File;
  preview?: string;
}

export default function App() {
  const [data, setData] = useState<DailyStats[]>([]);
  const [persistentData, setPersistentData] = useState<DailyStats[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [showResetModal, setShowResetModal] = useState(false);
  const [botQuery, setBotQuery] = useState('');
  const [isBotProcessing, setIsBotProcessing] = useState(false);

  // Load data from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('profit_pulse_data');
    const savedPersistent = localStorage.getItem('profit_pulse_persistent');
    if (saved) {
      try {
        setData(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load saved data");
      }
    }
    if (savedPersistent) {
      try {
        setPersistentData(JSON.parse(savedPersistent));
      } catch (e) {
        console.error("Failed to load saved persistent data");
      }
    }
  }, []);

  // Save data to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('profit_pulse_data', JSON.stringify(data));
  }, [data]);

  useEffect(() => {
    localStorage.setItem('profit_pulse_persistent', JSON.stringify(persistentData));
  }, [persistentData]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newPending = Array.from(files).map((file: File) => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
    }));

    setPendingFiles(prev => [...prev, ...newPending]);
    event.target.value = '';
  };

  const removePendingFile = (id: string) => {
    setPendingFiles(prev => {
      const fileToRemove = prev.find(f => f.id === id);
      if (fileToRemove?.preview) URL.revokeObjectURL(fileToRemove.preview);
      return prev.filter(f => f.id !== id);
    });
  };

  const startAnalysis = async () => {
    if (pendingFiles.length === 0) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const filePromises = pendingFiles.map(async (p) => {
        return new Promise<{ data: string; mimeType: string; name: string }>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            resolve({
              data: e.target?.result as string,
              mimeType: p.file.type,
              name: p.file.name
            });
          };
          if (p.file.type.startsWith('image/')) {
            reader.readAsDataURL(p.file);
          } else {
            reader.readAsText(p.file);
          }
        });
      });

      const processedFiles = await Promise.all(filePromises);
      const newStats = await analyzeTradingData(processedFiles);

      const updateDataList = (prev: DailyStats[]) => {
        const combined = [...prev];
        newStats.forEach(stat => {
          const index = combined.findIndex(s => s.date === stat.date);
          if (index >= 0) {
            combined[index] = stat;
          } else {
            combined.push(stat);
          }
        });
        return combined.sort((a, b) => a.date.localeCompare(b.date));
      };

      setData(updateDataList);
      setPersistentData(updateDataList);

      pendingFiles.forEach(p => {
        if (p.preview) URL.revokeObjectURL(p.preview);
      });
      setPendingFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const deleteRecord = (date: string) => {
    setData(prev => prev.filter(d => d.date !== date));
    setPersistentData(prev => prev.filter(d => d.date !== date));
  };

  const totalReset = () => {
    setData([]);
    setPersistentData([]);
    setShowResetModal(false);
  };

  const eraseHistory = () => {
    setData([]);
  };

  const clearPending = () => {
    pendingFiles.forEach(p => {
      if (p.preview) URL.revokeObjectURL(p.preview);
    });
    setPendingFiles([]);
  };

  const clearCharts = () => {
    // If the user wants to "clear displayed data" but keep history, 
    // maybe they mean clearing the charts view temporarily? 
    // However, charts are derived from data. 
    // Let's interpret "Clear Displayed Data" as clearing the pending uploads 
    // as per the user's likely reference to the "displayed" previews.
    clearPending();
  };

  const handleBotQuery = async () => {
    if (!botQuery.trim() || data.length === 0) return;
    
    setIsBotProcessing(true);
    setError(null);
    try {
      const updatedData = await processBotQuery(data, botQuery);
      setData(updatedData);
      
      // Also update persistent data by applying the same query logic
      // Since processBotQuery returns the full updated list, we should ideally
      // apply it to the persistent set too. 
      // For simplicity, if the bot modifies data, we sync both.
      setPersistentData(updatedData);
      
      setBotQuery('');
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bot query failed.");
    } finally {
      setIsBotProcessing(false);
    }
  };

  const totalProfit = persistentData.reduce((sum, d) => sum + d.profit, 0);
  const avgRoi = persistentData.length > 0 ? persistentData.reduce((sum, d) => sum + d.roi, 0) / persistentData.length : 0;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 nav-violet px-4 py-4 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-violet-200">
              <TrendingUp size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">ProfitPulse</h1>
              <p className="text-[10px] text-violet-200 font-black uppercase tracking-widest">Portfolio Analysis</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowResetModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/40 text-red-100 rounded-lg transition-all text-xs font-bold border border-red-500/30"
            >
              <Trash2 size={14} />
              <span>Total Reset</span>
            </button>
            <button 
              onClick={clearCharts}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all text-xs font-bold border border-white/20"
            >
              <X size={14} />
              <span>Clear Displayed Data</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 mt-8 space-y-8 flex-grow">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Action Sections */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upload Section */}
          <section className="card-pink p-6 space-y-6 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-pink-900">Upload Statements</h2>
                  <p className="text-sm text-pink-600/70">Select multiple screenshots or CSV files.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={eraseHistory}
                    className="p-2 bg-pink-50 text-pink-400 hover:text-red-600 rounded-xl transition-all border border-pink-100"
                    title="Erase Charts & History"
                  >
                    <Eraser size={18} />
                  </button>
                  <button 
                    onClick={clearPending}
                    className="p-2 bg-pink-50 text-pink-400 hover:text-red-600 rounded-xl transition-all border border-pink-100"
                    title="Clear Previews"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="cursor-pointer bg-pink-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-pink-700 transition-all flex items-center gap-2 shadow-lg shadow-pink-200">
                  <Plus size={18} />
                  <span>Select Files</span>
                  <input 
                    type="file" 
                    multiple 
                    className="hidden" 
                    onChange={handleFileSelect}
                    accept="image/*,.csv"
                    disabled={isAnalyzing}
                  />
                </label>
                {pendingFiles.length > 0 && (
                  <button 
                    onClick={startAnalysis}
                    disabled={isAnalyzing}
                    className="bg-zinc-900 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-zinc-800 transition-all flex items-center gap-2 shadow-lg shadow-zinc-200 disabled:opacity-50"
                  >
                    {isAnalyzing ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                    <span>Analyze {pendingFiles.length}</span>
                  </button>
                )}
              </div>
            </div>

            <AnimatePresence>
              {pendingFiles.length > 0 && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-4 border-t border-zinc-100 overflow-y-auto max-h-[120px]"
                >
                  {pendingFiles.map((p) => (
                    <motion.div 
                      key={p.id}
                      layout
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      className="relative group aspect-square bg-zinc-50 rounded-lg border border-zinc-200 overflow-hidden"
                    >
                      {p.preview ? (
                        <img src={p.preview} alt="preview" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-1 text-center">
                          <FileText size={16} className="text-zinc-400 mb-0.5" />
                          <span className="text-[8px] font-medium truncate w-full px-1">{p.file.name}</span>
                        </div>
                      )}
                      <button 
                        onClick={() => removePendingFile(p.id)}
                        className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md transition-all hover:bg-red-600"
                      >
                        <X size={10} />
                      </button>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* Bot Query Section */}
          <section className="card-pink p-6 space-y-4 flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-bold text-pink-900">ProfitPulse Bot Query</h2>
              <p className="text-sm text-pink-600/70">Ask to modify, update, or delete data using natural language.</p>
            </div>
            
            <div className="space-y-3">
              <textarea 
                value={botQuery}
                onChange={(e) => setBotQuery(e.target.value)}
                placeholder="Ex: Reduce my Total Brokerage and Govt Taxes charges from the profit..."
                className="w-full h-24 bg-white/50 border border-pink-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 transition-all resize-none"
              />
              <button 
                onClick={handleBotQuery}
                disabled={isBotProcessing || !botQuery.trim() || data.length === 0}
                className="w-full bg-zinc-900 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-zinc-200"
              >
                {isBotProcessing ? <Loader2 className="animate-spin" size={18} /> : <TrendingUp size={18} />}
                <span>Execute Query</span>
              </button>
            </div>
          </section>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard 
            label="Total Profit" 
            value={`₹${totalProfit.toLocaleString()}`} 
            icon={<IndianRupee className="text-emerald-600" />}
            trend={totalProfit >= 0 ? "positive" : "negative"}
          />
          <StatCard 
            label="Average ROI" 
            value={`${avgRoi.toFixed(2)}%`} 
            icon={<TrendingUp className="text-violet-600" />}
            trend={avgRoi >= 0 ? "positive" : "negative"}
          />
          <StatCard 
            label="Days Tracked" 
            value={data.length.toString()} 
            icon={<Calendar className="text-blue-600" />}
          />
        </div>

        {/* Summary & Charts Section */}
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <ChartCard title="Portfolio Summary">
              <div className="h-full flex flex-col justify-between py-2 px-4">
                <div className="space-y-6">
                  <div>
                    <p className="text-xs font-bold text-pink-700/60 uppercase tracking-widest mb-1">Total Portfolio Profit</p>
                    <h4 className={cn(
                      "text-5xl font-black tracking-tighter",
                      totalProfit >= 0 ? "text-emerald-600" : "text-red-600"
                    )}>
                      {totalProfit >= 0 ? '+' : ''}₹{totalProfit.toLocaleString()}
                    </h4>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-pink-700/60 uppercase tracking-widest mb-1">Lifetime Avg ROI</p>
                    <h4 className={cn(
                      "text-5xl font-black tracking-tighter",
                      avgRoi >= 0 ? "text-emerald-600" : "text-red-600"
                    )}>
                      {avgRoi >= 0 ? '+' : ''}{avgRoi.toFixed(2)}%
                    </h4>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-pink-200/30">
                  <div className="flex flex-col">
                    <p className="text-[10px] font-bold text-black uppercase tracking-tight">
                      {persistentData.length > 0 ? (
                        <>
                          From {safeFormatDate(persistentData[0].date, 'MMM dd, yyyy')} to {safeFormatDate(persistentData[persistentData.length - 1].date, 'MMM dd, yyyy')}
                          <span className="ml-1">({persistentData.length} Traded Days)</span>
                        </>
                      ) : (
                        "No trading data available"
                      )}
                    </p>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-pink-900/40 uppercase tracking-[0.2em]">
                      Status: {totalProfit >= 0 ? 'Profitable' : 'Loss Recovery'}
                    </p>
                  </div>
                </div>
              </div>
            </ChartCard>

            {data.length > 0 ? (
              <>
                <ChartCard title="Daily Profit (₹)">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <defs>
                        <linearGradient id="profitUp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#059669" stopOpacity={1}/>
                        </linearGradient>
                        <linearGradient id="profitDown" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#dc2626" stopOpacity={1}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(val) => safeFormatDate(val, 'dd-MM')}
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        labelFormatter={(val) => safeFormatDate(val as string, 'PPP')}
                      />
                      <Bar dataKey="profit" radius={[4, 4, 0, 0]} barSize={20}>
                        {data.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.profit >= 0 ? 'url(#profitUp)' : 'url(#profitDown)'} />
                        ))}
                        <LabelList dataKey="profit" position="top" fontSize={8} formatter={(val: number) => `₹${val}`} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Daily ROI (%)">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <defs>
                        <linearGradient id="roiGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#d946ef" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#a21caf" stopOpacity={1}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(val) => safeFormatDate(val, 'dd-MM')}
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        labelFormatter={(val) => safeFormatDate(val as string, 'PPP')}
                      />
                      <Bar dataKey="roi" fill="url(#roiGradient)" radius={[4, 4, 0, 0]} barSize={20}>
                        <LabelList dataKey="roi" position="top" fontSize={8} formatter={(val: number) => `${val}%`} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </>
            ) : (
              <div className="lg:col-span-2 flex items-center justify-center bg-white/10 rounded-2xl border border-white/20 border-dashed p-12">
                <div className="text-center space-y-2">
                  <TrendingUp className="mx-auto text-white/40" size={48} />
                  <p className="text-white/60 font-bold uppercase tracking-widest text-xs">Upload data to view charts</p>
                </div>
              </div>
            )}
          </div>

          {data.length > 0 && (
            <div className="space-y-8">
              {/* Data Table */}
            <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-xl">
              <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                <h3 className="font-bold">Recent History</h3>
                <span className="text-xs text-zinc-500 font-mono">Last 30 days</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-zinc-50 text-zinc-500 text-xs uppercase tracking-wider">
                      <th className="px-6 py-3 font-medium">Date</th>
                      <th className="px-6 py-3 font-medium">Profit</th>
                      <th className="px-6 py-3 font-medium">Investment</th>
                      <th className="px-6 py-3 font-medium">ROI</th>
                      <th className="px-6 py-3 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {data.slice().reverse().map((row) => (
                      <tr key={row.date} className="hover:bg-zinc-50 transition-colors group">
                        <td className="px-6 py-4 text-sm font-medium">{safeFormatDate(row.date, 'MMM dd, yyyy')}</td>
                        <td className={cn("px-6 py-4 text-sm font-bold", row.profit >= 0 ? "text-emerald-600" : "text-red-600")}>
                          {row.profit >= 0 ? '+' : ''}₹{row.profit.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-600">₹{row.investment.toLocaleString()}</td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                            row.roi >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                          )}>
                            {row.roi.toFixed(2)}%
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => deleteRecord(row.date)}
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Delete Record"
                          >
                            <X size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 py-4 text-center mt-auto">
        <div className="h-[1px] bg-black/10 w-full mb-4" />
        <div className="flex flex-col items-center justify-center space-y-1">
          <p className="text-black font-bold text-sm">
            © 2026 Narendra Nandyala. All rights reserved.
          </p>
          <p className="text-black/40 text-[10px] uppercase tracking-[0.2em] font-black">
            ProfitPulse Portfolio Analytics Engine
          </p>
        </div>
      </footer>

      {/* Reset Modal */}
      <AnimatePresence>
        {showResetModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowResetModal(false)}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white p-8 rounded-3xl max-w-sm w-full shadow-2xl text-center space-y-6"
            >
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
                <AlertTriangle size={32} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-zinc-900">Total Reset?</h3>
                <p className="text-zinc-500 text-sm mt-2">
                  This will permanently delete all your trading history and charts. This action cannot be undone.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <button 
                  onClick={totalReset}
                  className="w-full bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-all"
                >
                  Yes, Reset Everything
                </button>
                <button 
                  onClick={() => setShowResetModal(false)}
                  className="w-full bg-zinc-100 text-zinc-600 py-3 rounded-xl font-bold hover:bg-zinc-200 transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Loading Overlay */}
      <AnimatePresence>
        {isAnalyzing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-zinc-900/80 backdrop-blur-md flex flex-col items-center justify-center space-y-4"
          >
            <Loader2 className="animate-spin text-orange-500" size={64} />
            <div className="text-center text-white">
              <h3 className="text-2xl font-black tracking-tight">Analyzing your data...</h3>
              <p className="text-zinc-400">Gemini is extracting profits and ROI from your files.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ label, value, icon, trend }: { label: string; value: string; icon: React.ReactNode; trend?: 'positive' | 'negative' }) {
  return (
    <div className="card-pink p-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-pink-700/60 uppercase tracking-wider">{label}</span>
        <div className="w-8 h-8 rounded-lg bg-white/50 flex items-center justify-center">
          {icon}
        </div>
      </div>
      <div className="flex items-end gap-2">
        <span className={cn("text-2xl font-black tracking-tight", trend === 'negative' ? 'text-red-600' : 'text-pink-900')}>
          {value}
        </span>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card-pink p-6">
      <h3 className="text-sm font-black text-pink-900 mb-6 flex items-center gap-2 uppercase tracking-wider">
        <div className="w-1.5 h-4 bg-pink-500 rounded-full" />
        {title}
      </h3>
      <div className="h-[300px]">
        {children}
      </div>
    </div>
  );
}
