import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Trash2, CheckCircle, Loader2, ChevronRight, ArrowLeft, FileQuestion, Ban } from 'lucide-react';
import { scanDownloads, cleanDownloads } from '../utils/cleaner';
import { getSettings } from '../utils/storage';
import './index.css';

interface CleanableItem {
    id: number;
    filename: string;
    url: string;
}

const App = () => {
    const [missingItems, setMissingItems] = useState<CleanableItem[]>([]);
    const [interruptedItems, setInterruptedItems] = useState<CleanableItem[]>([]);

    // UI State
    const [view, setView] = useState<'summary' | 'details'>('summary');

    // Selection state
    const [cleanMissing, setCleanMissing] = useState(true);
    const [cleanInterrupted, setCleanInterrupted] = useState(true);

    const [loading, setLoading] = useState(true);
    const [cleaning, setCleaning] = useState(false);
    const [done, setDone] = useState(false);

    useEffect(() => {
        const init = async () => {
            const settings = await getSettings();
            const result = await scanDownloads();

            setMissingItems(result.missingFiles as CleanableItem[]);
            setInterruptedItems(result.interruptedFiles as CleanableItem[]);

            // Initialize selection based on settings preference AND availability
            setCleanMissing(settings.scanMissing && result.missingFiles.length > 0);
            setCleanInterrupted(settings.scanInterrupted && result.interruptedFiles.length > 0);

            setLoading(false);

            if (result.missingFiles.length + result.interruptedFiles.length === 0) {
                setTimeout(() => window.close(), 2000);
            }
        };
        init();
    }, []);

    const handleClean = async () => {
        if (!cleanMissing && !cleanInterrupted) return;

        setCleaning(true);

        let ids: number[] = [];
        if (cleanMissing) ids = [...ids, ...missingItems.map(i => i.id)];
        if (cleanInterrupted) ids = [...ids, ...interruptedItems.map(i => i.id)];

        await cleanDownloads(ids);
        setCleaning(false);
        setDone(true);

        setTimeout(() => {
            window.close();
        }, 2000);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen w-screen bg-zinc-50 dark:bg-zinc-900">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
        );
    }

    if (done) {
        return (
            <div className="flex flex-col items-center justify-center h-screen w-screen bg-zinc-50 dark:bg-zinc-900 p-6 text-center">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <h2 className="text-xl font-bold mb-1">Cleaned!</h2>
                <p className="text-zinc-500 text-sm">Closing window...</p>
            </div>
        );
    }

    const totalFound = missingItems.length + interruptedItems.length;
    const selectedCount = (cleanMissing ? missingItems.length : 0) + (cleanInterrupted ? interruptedItems.length : 0);

    if (view === 'details') {
        return (
            <div className="h-screen w-screen bg-white dark:bg-zinc-900 flex flex-col font-sans">
                <div className="flex items-center p-4 border-b border-zinc-100 dark:border-zinc-800">
                    <button
                        onClick={() => setView('summary')}
                        className="p-2 -ml-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-500 transition-colors cursor-pointer"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h2 className="font-bold text-zinc-900 dark:text-zinc-100 ml-2">Cleanable Items</h2>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {missingItems.length > 0 && (
                        <div>
                            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <FileQuestion className="w-3 h-3" />
                                Missing Files ({missingItems.length})
                            </h3>
                            <div className="space-y-1">
                                {missingItems.map(item => (
                                    <div key={item.id} className="text-sm p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900 break-all">
                                        <div className="font-medium text-zinc-700 dark:text-zinc-300 line-clamp-1">{item.filename}</div>
                                        <div className="text-xs text-zinc-400 font-mono mt-0.5 opacity-60 line-clamp-1">{item.url}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {interruptedItems.length > 0 && (
                        <div>
                            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <Ban className="w-3 h-3" />
                                Interrupted Downloads ({interruptedItems.length})
                            </h3>
                            <div className="space-y-1">
                                {interruptedItems.map(item => (
                                    <div key={item.id} className="text-sm p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900 break-all">
                                        <div className="font-medium text-zinc-700 dark:text-zinc-300 line-clamp-1">{item.filename}</div>
                                        <div className="text-xs text-zinc-400 font-mono mt-0.5 opacity-60 line-clamp-1">{item.url}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen w-screen bg-white dark:bg-zinc-900 flex flex-col p-6 font-sans">
            <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4 relative">
                    <Trash2 className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                    {selectedCount > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full border-2 border-white dark:border-zinc-900">
                            {selectedCount}
                        </span>
                    )}
                </div>

                <h1 className="text-lg font-bold mb-1">Clean Downloads?</h1>
                <p className="text-zinc-500 text-sm mb-6">
                    Found {totalFound} useless entries.
                </p>

                <div className="flex gap-4 w-full text-xs font-medium justify-center mb-6">
                    <button
                        onClick={() => missingItems.length > 0 && setCleanMissing(!cleanMissing)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-full border transition-all ${cleanMissing
                            ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100'
                            : 'bg-transparent border-transparent text-zinc-400 dark:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                            } ${missingItems.length === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                        <div className={`w-4 h-4 rounded flex items-center justify-center border ${cleanMissing ? 'bg-blue-500 border-blue-500' : 'border-zinc-300 dark:border-zinc-600'
                            }`}>
                            {cleanMissing && <CheckCircle className="w-3 h-3 text-white" />}
                        </div>
                        {missingItems.length} Missing
                    </button>

                    <button
                        onClick={() => interruptedItems.length > 0 && setCleanInterrupted(!cleanInterrupted)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-full border transition-all ${cleanInterrupted
                            ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100'
                            : 'bg-transparent border-transparent text-zinc-400 dark:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                            } ${interruptedItems.length === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                        <div className={`w-4 h-4 rounded flex items-center justify-center border ${cleanInterrupted ? 'bg-blue-500 border-blue-500' : 'border-zinc-300 dark:border-zinc-600'
                            }`}>
                            {cleanInterrupted && <CheckCircle className="w-3 h-3 text-white" />}
                        </div>
                        {interruptedItems.length} Failed
                    </button>
                </div>

                <button
                    onClick={() => setView('details')}
                    className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline flex items-center justify-center gap-1 cursor-pointer"
                >
                    View Details <ChevronRight className="w-3 h-3" />
                </button>
            </div>

            <div className="flex gap-3">
                <button
                    onClick={() => window.close()}
                    className="flex-1 py-3 px-4 rounded-xl font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                >
                    Cancel
                </button>
                <button
                    onClick={handleClean}
                    disabled={cleaning || selectedCount === 0}
                    className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale"
                >
                    {cleaning ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Clean Now'}
                </button>
            </div>
        </div>
    );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
