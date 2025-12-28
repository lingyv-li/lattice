import { useState } from 'react';
import { Trash2, CheckCircle, Loader2 } from 'lucide-react';
import { useDownloadCleaner } from '../hooks/useDownloadCleaner';
import { CleanerDetails } from './components/CleanerDetails';
import { CleanerSummary } from './components/CleanerSummary';

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

    if (loading) {
        return (
            <div className="p-6 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
        );
    }

    if (totalFound === 0 && !done) {
        return (
            <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 mb-4">
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

    if (done) {
        return (
            <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 mb-4 relative">
                <div className="flex items-center gap-2 mb-2">
                    <Trash2 className="w-5 h-5 text-blue-500" />
                    <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">Download Cleaner</h3>
                </div>
                <div className="flex flex-col items-center justify-center py-4 text-center">
                    <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-2">
                        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                    <p className="text-zinc-500 text-xs">Cleaned successfully!</p>
                </div>
            </div>
        );
    }

    return (
        <CleanerSummary
            missingItems={missingItems}
            interruptedItems={interruptedItems}
            cleanMissing={cleanMissing}
            setCleanMissing={setCleanMissing}
            cleanInterrupted={cleanInterrupted}
            setCleanInterrupted={setCleanInterrupted}
            onDetails={() => setView('details')}
            onClean={handleClean}
            cleaning={cleaning}
        />
    );
};

