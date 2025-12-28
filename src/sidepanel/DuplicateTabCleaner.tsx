import { CopyMinus, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useDuplicateCleaner } from '../hooks/useDuplicateCleaner';
import { CleanState } from './components/CleanState';

export const DuplicateTabCleaner = () => {
    const { status, closedCount, duplicateCount, closeDuplicates } = useDuplicateCleaner();

    // Show "clean" state when no duplicates
    if (duplicateCount === 0 && status !== 'cleaning') {
        return <CleanState icon={CopyMinus} title="Duplicate Cleaner" message="No duplicates!" />;
    }

    return (
        <div className="p-4 bg-surface-dim rounded-xl border border-border-subtle mb-4">
            <div className="flex items-center gap-2 mb-2">
                <CopyMinus className={`w-5 h-5 ${duplicateCount > 0 ? 'text-orange-500' : 'text-muted'}`} />
                <h3 className="font-bold text-sm text-main">Duplicate Cleaner</h3>
            </div>

            <p className="text-xs text-muted mb-4">
                {`Found ${duplicateCount} duplicate ${duplicateCount === 1 ? 'tab' : 'tabs'}.`}
            </p>

            <button
                onClick={closeDuplicates}
                disabled={status === 'cleaning'}
                className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 
                    ${status === 'success'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-border-subtle hover:bg-surface-dim text-main'
                    } disabled:opacity-50`}
            >
                {status === 'cleaning' ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Cleaning...</span>
                    </>
                ) : status === 'success' ? (
                    <>
                        <CheckCircle className="w-4 h-4" />
                        <span>{closedCount > 0 ? `Closed ${closedCount} tabs` : 'Cleaned!'}</span>
                    </>
                ) : status === 'error' ? (
                    <>
                        <AlertCircle className="w-4 h-4 text-red-500" />
                        <span>Error</span>
                    </>
                ) : (
                    <>
                        <span>Close {duplicateCount} Duplicates</span>
                    </>
                )}
            </button>
        </div>
    );
};
