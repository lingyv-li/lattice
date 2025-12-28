import { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { useDownloadCleaner } from '../hooks/useDownloadCleaner';
import { CleanerDetails } from './components/CleanerDetails';
import { CleanerSummary } from './components/CleanerSummary';
import { CleanState } from './components/CleanState';

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
        return <CleanState icon={Trash2} title="Download Cleaner" message="Downloads are clean!" />;
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
        return <CleanState icon={Trash2} title="Download Cleaner" message="Cleaned successfully!" />;
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

