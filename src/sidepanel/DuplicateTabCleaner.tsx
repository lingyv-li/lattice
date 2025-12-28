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
        <div className="p-[var(--spacing-card-padding)] bg-surface-dim rounded-xl border border-border-subtle mb-4">
            <div className="flex items-center gap-[var(--spacing-item-gap)] mb-2">
                <CopyMinus className={`size-[var(--size-icon-md)] ${duplicateCount > 0 ? 'text-orange-500' : 'text-muted'}`} />
                <h3 className="font-bold text-sm text-main">Duplicate Cleaner</h3>
            </div>

            <p className="text-xs text-muted mb-4">
                {`Found ${duplicateCount} duplicate ${duplicateCount === 1 ? 'tab' : 'tabs'}.`}
            </p>

            <button
                onClick={closeDuplicates}
                disabled={status === 'cleaning'}
                className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-[var(--spacing-item-gap)] 
                    ${status === 'success'
                        ? 'bg-status-success-bg text-status-success-fg'
                        : 'bg-btn-primary-bg hover:bg-btn-primary-hover text-btn-primary-fg shadow-sm'
                    } disabled:opacity-50`}
            >
                {status === 'cleaning' ? (
                    <>
                        <Loader2 className="size-[var(--size-icon-sm)] animate-spin" />
                        <span>Cleaning...</span>
                    </>
                ) : status === 'success' ? (
                    <>
                        <CheckCircle className="size-[var(--size-icon-sm)]" />
                        <span>{closedCount > 0 ? `Closed ${closedCount} tabs` : 'Cleaned!'}</span>
                    </>
                ) : status === 'error' ? (
                    <>
                        <AlertCircle className="size-[var(--size-icon-sm)] text-status-error-fg" />
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
