import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Settings, Save, Sparkles, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AppSettings, DEFAULT_SETTINGS, getSettings, saveSettings } from '../utils/storage';
import { listAvailableModels, ModelInfo } from '../utils/gemini';
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

    useEffect(() => {
        getSettings().then((s) => {
            setSettings(s);
            setLoading(false);
            if (s.aiProvider === 'gemini' && s.geminiApiKey) {
                fetchModels(s.geminiApiKey);
            }
        });
    }, []);

    const fetchModels = async (key: string) => {
        if (!key) return;
        setLoadingModels(true);
        try {
            const models = await listAvailableModels(key);
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

    const toggle = (key: keyof AppSettings) => {
        setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
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

                        <div className="grid grid-cols-2 gap-2 p-1 bg-surface-dim rounded-2xl border border-border-subtle">
                            <button
                                onClick={() => setSettings(s => ({ ...s, aiProvider: 'local' }))}
                                className={cn(
                                    "py-2 rounded-xl text-sm font-medium transition-all",
                                    settings.aiProvider === 'local'
                                        ? "bg-white shadow-sm text-black"
                                        : "text-muted hover:text-main"
                                )}
                            >
                                Local (Chrome)
                            </button>
                            <button
                                onClick={() => setSettings(s => ({ ...s, aiProvider: 'gemini' }))}
                                className={cn(
                                    "py-2 rounded-xl text-sm font-medium transition-all",
                                    settings.aiProvider === 'gemini'
                                        ? "bg-white shadow-sm text-black"
                                        : "text-muted hover:text-main"
                                )}
                            >
                                Cloud (Gemini)
                            </button>
                        </div>

                        {settings.aiProvider === 'gemini' && (
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
                        <h2 className="text-xs font-bold uppercase tracking-wider text-muted pl-1">Automation</h2>

                        <label className="flex items-center justify-between p-4 bg-surface-dim rounded-2xl border border-border-subtle cursor-pointer group hover:border-teal-500/30 transition-colors">
                            <span className="font-medium text-main">Scan for missing files</span>
                            <div
                                className={cn(
                                    "w-12 h-7 rounded-full transition-colors relative",
                                    settings.scanMissing ? "bg-teal-500" : "bg-border-subtle"
                                )}
                                onClick={() => toggle('scanMissing')}
                            >
                                <div className={cn(
                                    "absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform shadow-sm",
                                    settings.scanMissing ? "translate-x-5" : "translate-x-0"
                                )} />
                            </div>
                        </label>

                        <label className="flex items-center justify-between p-4 bg-surface-dim rounded-2xl border border-border-subtle cursor-pointer group hover:border-teal-500/30 transition-colors">
                            <span className="font-medium text-main">Scan for interrupted downloads</span>
                            <div
                                className={cn(
                                    "w-12 h-7 rounded-full transition-colors relative",
                                    settings.scanInterrupted ? "bg-teal-500" : "bg-border-subtle"
                                )}
                                onClick={() => toggle('scanInterrupted')}
                            >
                                <div className={cn(
                                    "absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform shadow-sm",
                                    settings.scanInterrupted ? "translate-x-5" : "translate-x-0"
                                )} />
                            </div>
                        </label>
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

