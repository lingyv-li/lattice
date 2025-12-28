import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Settings, Save, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AppSettings, DEFAULT_SETTINGS, getSettings, saveSettings } from '../utils/storage';
import './index.css';

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

const App = () => {
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        getSettings().then((s) => {
            setSettings(s);
            setLoading(false);
        });
    }, []);

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
                        <p className="text-sm text-muted font-medium">One-click optimization</p>
                    </div>
                </div>

                <div className="space-y-6">
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

