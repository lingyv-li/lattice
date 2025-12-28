import { useState } from 'react';
import { Trash2, CheckCircle, Loader2 } from 'lucide-react';
import { useDownloadCleaner } from '../hooks/useDownloadCleaner';
import { CleanerDetails } from './components/CleanerDetails';

export const DownloadCleaner = () => {
    const [view, setView] = useState<'summary' | 'details'>('summary');
    const {
        missingItems,
        interruptedItems,
        cleanMissing,
        setCleanMissing,
        cleanInterrupted,
        setCleanInterrupted,
        loading,
        cleaning,
        done,
        handleClean
    } = useDownloadCleaner();

    const totalFound = missingItems.length + interruptedItems.length;
    const selectedCount = (cleanMissing ? missingItems.length : 0) + (cleanInterrupted ? interruptedItems.length : 0);

    if (loading) {
        return (
            <div className="p-6 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
        );
    }

    if (totalFound === 0 && !done) {
        return (
            <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-2 mb-2">
                    <Trash2 className="w-5 h-5 text-zinc-400" />
                    <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">Download Cleaner</h3>
                </div>
                <div className="flex flex-col items-center justify-center py-4 text-center">
                    <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-2">
                        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                    <p className="text-zinc-500 text-xs">Downloads are clean!</p>
                </div>
            </div>
        )
    }

    if (view === 'details') {
        return (
            <CleanerDetails
                missingItems={missingItems}
                interruptedItems={interruptedItems}
                onBack={() => setView('summary')}
            />
        );
    }

    return (
        <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 mb-4 relative">
            <div className="flex items-center gap-2 mb-2">
                <Trash2 className="w-5 h-5 text-blue-500" />
                <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">Download Cleaner</h3>
                {selectedCount > 0 && !done && (
                    <span className="ml-auto bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-bold px-2 py-0.5 rounded-full">
                        {selectedCount} issues
                    </span>
                )}
            </div>

            {done ? (
                <div className="flex flex-col items-center justify-center py-4 text-center">
                    <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-2">
                        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                    <p className="text-zinc-500 text-xs">Cleaned successfully!</p>
                </div>
            ) : (
                <>
                    <p className="text-xs text-zinc-500 mb-4">
                        Found {totalFound} useless files taking up space in your download history.
                    </p>

                    <div className="flex gap-2 w-full text-xs font-medium mb-4">
                        <button
                            onClick={() => missingItems.length > 0 && setCleanMissing(!cleanMissing)}
                            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-all ${cleanMissing
                                ? 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                                : 'bg-transparent border-transparent text-zinc-400 dark:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                } ${missingItems.length === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                            {cleanMissing && <CheckCircle className="w-3 h-3 text-blue-500" />}
                            {missingItems.length} Missing
                        </button>

                        <button
                            onClick={() => interruptedItems.length > 0 && setCleanInterrupted(!cleanInterrupted)}
                            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-all ${cleanInterrupted
                                ? 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                                : 'bg-transparent border-transparent text-zinc-400 dark:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                } ${interruptedItems.length === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                            {cleanInterrupted && <CheckCircle className="w-3 h-3 text-blue-500" />}
                            {interruptedItems.length} Failed
                        </button>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={() => setView('details')}
                            className="py-2 px-3 rounded-lg font-medium text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors text-xs"
                        >
                            Details
                        </button>
                        <button
                            onClick={handleClean}
                            disabled={cleaning || selectedCount === 0}
                            className="flex-1 py-2 px-4 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale text-sm"
                        >
                            {cleaning ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Clean Selected'}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};
