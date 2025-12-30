import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Settings, Save, Sparkles, RefreshCw, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AppSettings, DEFAULT_SETTINGS, getSettings, saveSettings, AIProviderType } from '../utils/storage';
import { AIService } from '../services/ai/AIService';
import { ModelInfo } from '../services/ai/types';
import './index.css';

const cn = (...inputs: (string | undefined | null | false)[]) => {
    return twMerge(clsx(inputs));
};

const sortModels = (models: ModelInfo[]) => {
    return [...models].sort((a, b) => {
        // Extract version from ID: gemini-1.5-flash -> 1.5
        const getVersion = (s: string) => {
            const match = s.match(/gemini-(\d+(\.\d+)?)/);
            return match ? parseFloat(match[1]) : 0;
        };

        const vA = getVersion(a.id);
        const vB = getVersion(b.id);

        if (vA !== vB) return vB - vA; // Higher version first

        // Priority tiers if versions match
        const getTier = (s: string) => {
            if (s.includes('pro')) return 3;
            if (s.includes('flash')) return 2;
            if (s.includes('lite')) return 1;
            return 0;
        };

        const tA = getTier(a.id);
        const tB = getTier(b.id);

        if (tA !== tB) return tB - tA; // Pro > Flash > Lite

        return a.displayName.localeCompare(b.displayName);
    });
};

const App = () => {
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);
    const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
    const [loadingModels, setLoadingModels] = useState(false);
    const [showApiKey, setShowApiKey] = useState(false);

    // Download Progress State
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState<{ loaded: number, total: number } | null>(null);
    const [downloadError, setDownloadError] = useState<string | null>(null);

    useEffect(() => {
        getSettings().then((s) => {
            setSettings(s);
            setLoading(false);
            if (s.aiProvider === AIProviderType.Gemini && s.geminiApiKey) {
                fetchModels(s.geminiApiKey);
            }
        });
    }, []);

    const fetchModels = async (key: string) => {
        if (!key) return;
        setLoadingModels(true);
        try {
            const models = await AIService.listGeminiModels(key);
            setAvailableModels(sortModels(models));
        } catch (e) {
            console.error("Failed to fetch models", e);
        } finally {
            setLoadingModels(false);
        }
    };

    const handleSave = async () => {
        await saveSettings(settings);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const handleProviderChange = async (provider: AIProviderType) => {
        if (provider === AIProviderType.Local) {
            setIsDownloading(true);
            setDownloadError(null);
            setDownloadProgress(null);

            try {
                await AIService.initializeLocalModel((loaded, total) => {
                    setDownloadProgress({ loaded, total });
                });
                setSettings(s => ({ ...s, aiProvider: AIProviderType.Local }));
            } catch (e: any) {
                console.error("Failed to initialize local model", e);
                setDownloadError(e.message || "Failed to load local AI model");
                // Don't switch provider if failed
            } finally {
                setIsDownloading(false);
                setDownloadProgress(null);
            }
        } else {
            setSettings(s => ({ ...s, aiProvider: provider }));
        }
    };

    if (loading) return <div className="p-8 text-muted">Loading...</div>;

    return (
        <div className="min-h-screen flex items-center justify-center bg-surface-dim p-4 font-sans">
            <div className="w-full max-w-md bg-surface/70 backdrop-blur-xl border border-white/20 shadow-xl rounded-3xl p-8 transition-all hover:shadow-2xl hover:scale-[1.01]">

                <div className="flex items-center gap-3 mb-8">
                    <div className="p-3 bg-teal-500/10 rounded-2xl">
                        <Sparkles className="w-6 h-6 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-main tracking-tight">Lattice</h1>
                        <p className="text-sm text-muted font-medium">AI Browser Organizer</p>
                    </div>
                </div>

                <div className="space-y-6">

                    <div className="space-y-4">
                        <h2 className="text-xs font-bold uppercase tracking-wider text-muted pl-1">AI Provider</h2>

                        <div className="grid grid-cols-3 gap-2 p-1 bg-surface-dim rounded-2xl border border-border-subtle">
                            <button
                                onClick={() => handleProviderChange(AIProviderType.Local)}
                                disabled={isDownloading}
                                className={cn(
                                    "py-2 rounded-xl text-sm font-medium transition-all",
                                    settings.aiProvider === AIProviderType.Local
                                        ? "bg-white shadow-sm text-black"
                                        : "text-muted hover:text-main"
                                )}
                            >
                                Local
                            </button>
                            <button
                                onClick={() => handleProviderChange(AIProviderType.Gemini)}
                                disabled={isDownloading}
                                className={cn(
                                    "py-2 rounded-xl text-sm font-medium transition-all",
                                    settings.aiProvider === AIProviderType.Gemini
                                        ? "bg-white shadow-sm text-black"
                                        : "text-muted hover:text-main"
                                )}
                            >
                                Cloud
                            </button>
                            <button
                                onClick={() => handleProviderChange(AIProviderType.None)}
                                disabled={isDownloading}
                                className={cn(
                                    "py-2 rounded-xl text-sm font-medium transition-all",
                                    settings.aiProvider === AIProviderType.None
                                        ? "bg-white shadow-sm text-black"
                                        : "text-muted hover:text-main"
                                )}
                            >
                                None
                            </button>
                        </div>

                        {/* Download Progress Modal/Overlay */}
                        {isDownloading && (
                            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                                <div className="bg-surface border border-border-subtle rounded-2xl p-6 shadow-2xl max-w-sm w-full">
                                    <div className="flex flex-col items-center gap-4 text-center">
                                        <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center">
                                            <Sparkles className="w-6 h-6 text-blue-500 animate-pulse" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg text-main">Downloading AI Model</h3>
                                            <p className="text-sm text-muted mt-1">This happens only once. Please do not close this window.</p>
                                        </div>

                                        {downloadProgress && (
                                            <div className="w-full space-y-2">
                                                <div className="h-2 bg-surface-dim rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-blue-500 transition-all duration-300"
                                                        style={{ width: `${(downloadProgress.loaded / downloadProgress.total) * 100}%` }}
                                                    />
                                                </div>
                                                <p className="text-xs text-muted font-mono">
                                                    {(downloadProgress.loaded / 1024 / 1024).toFixed(1)}MB / {(downloadProgress.total / 1024 / 1024).toFixed(1)}MB
                                                </p>
                                            </div>
                                        )}

                                        {!downloadProgress && <Loader2 className="w-6 h-6 animate-spin text-muted" />}
                                    </div>
                                </div>
                            </div>
                        )}

                        {downloadError && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-500 flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" />
                                <span>{downloadError}</span>
                            </div>
                        )}

                        {settings.aiProvider === AIProviderType.Gemini && (
                            <div className="space-y-3 animate-in fade-in slide-in-from-top-4 duration-300">
                                <div>
                                    <label className="block text-xs font-medium text-muted mb-1 ml-1">API Key</label>
                                    <div className="relative">
                                        <input
                                            type={showApiKey ? "text" : "password"}
                                            value={settings.geminiApiKey}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setSettings(s => ({ ...s, geminiApiKey: val }));
                                            }}
                                            onBlur={() => fetchModels(settings.geminiApiKey)}
                                            placeholder="Enter Gemini API Key"
                                            className="w-full bg-surface-dim border border-border-subtle rounded-xl py-2 pl-3 pr-10 text-sm text-main focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all"
                                        />
                                        <button
                                            onClick={() => setShowApiKey(!showApiKey)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-main"
                                        >
                                            {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-1 ml-1">
                                        <label className="text-xs font-medium text-muted">Model</label>
                                        <button
                                            onClick={() => fetchModels(settings.geminiApiKey)}
                                            disabled={loadingModels || !settings.geminiApiKey}
                                            className="text-[10px] flex items-center gap-1 text-teal-600 hover:text-teal-500 disabled:opacity-50"
                                        >
                                            <RefreshCw className={cn("w-3 h-3", loadingModels && "animate-spin")} /> Refresh
                                        </button>
                                    </div>
                                    <select
                                        value={settings.aiModel}
                                        onChange={(e) => setSettings(s => ({ ...s, aiModel: e.target.value }))}
                                        className="w-full bg-surface-dim border border-border-subtle rounded-xl py-2 px-3 text-sm text-main focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all appearance-none"
                                    >
                                        {availableModels.length === 0 && <option value={settings.aiModel}>{settings.aiModel || "Enter Key to fetch models"}</option>}
                                        {availableModels.map(m => (
                                            <option key={m.id} value={m.id}>{m.displayName}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>



                    <div className="space-y-4">
                        <h2 className="text-xs font-bold uppercase tracking-wider text-muted pl-1">Grouping Rules</h2>

                        <div className="p-4 bg-surface-dim rounded-2xl border border-border-subtle group hover:border-teal-500/30 transition-colors focus-within:border-teal-500/50">
                            <label className="block font-medium text-main mb-2">Custom AI Instructions</label>
                            <p className="text-sm text-muted mb-3">Add specific rules for the AI to follow when grouping tabs (e.g., "Group all Jira tickets together").</p>
                            <textarea
                                value={settings.customGroupingRules}
                                onChange={(e) => setSettings({ ...settings, customGroupingRules: e.target.value })}
                                placeholder="- All GitHub pages go to 'Code'&#10;- Group 'Docs' and 'Sheets' into 'Work'"
                                className="w-full h-32 bg-surface/50 rounded-xl border border-border-subtle p-3 text-sm text-main placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all resize-none"
                            />
                        </div>
                    </div>

                    <button
                        onClick={handleSave}
                        className={cn(
                            "w-full py-4 rounded-2xl font-bold text-white transition-all flex items-center justify-center gap-2",
                            saved ? "bg-green-500 hover:bg-green-600" : "bg-btn-primary-bg text-btn-primary-fg hover:bg-btn-primary-hover"
                        )}
                    >
                        {saved ? (
                            <>
                                <Settings className="w-5 h-5" /> Saved
                            </>
                        ) : (
                            <>
                                <Save className="w-5 h-5" /> Save Preference
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
