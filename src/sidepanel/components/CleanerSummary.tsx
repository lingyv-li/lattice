import { Trash2, CheckCircle, Loader2 } from 'lucide-react';
import { CleanableItem } from '../../hooks/useDownloadCleaner';

interface CleanerSummaryProps {
    missingItems: CleanableItem[];
    interruptedItems: CleanableItem[];
    cleanMissing: boolean;
    setCleanMissing: (value: boolean) => void;
    cleanInterrupted: boolean;
    setCleanInterrupted: (value: boolean) => void;
    onDetails: () => void;
    onClean: () => void;
    cleaning: boolean;
}

export const CleanerSummary = ({
    missingItems,
    interruptedItems,
    cleanMissing,
    setCleanMissing,
    cleanInterrupted,
    setCleanInterrupted,
    onDetails,
    onClean,
    cleaning
}: CleanerSummaryProps) => {
    const totalFound = missingItems.length + interruptedItems.length;
    const selectedCount = (cleanMissing ? missingItems.length : 0) + (cleanInterrupted ? interruptedItems.length : 0);

    return (
        <div className="p-[var(--spacing-card-padding)] bg-surface-dim rounded-xl border border-border-subtle mb-4 relative">
            <div className="flex items-center gap-[var(--spacing-item-gap)] mb-2">
                <Trash2 className="size-[var(--size-icon-md)] text-status-info-fg" />
                <h3 className="font-bold text-sm text-main">Download Cleaner</h3>
            </div>

            <p className="text-xs text-muted mb-4">
                Found {totalFound} useless files taking up space in your download history.
            </p>

            <div className="flex gap-2 w-full text-xs font-medium mb-4">
                <button
                    onClick={() => missingItems.length > 0 && setCleanMissing(!cleanMissing)}
                    className={`flex-1 flex items-center justify-center gap-[var(--spacing-item-gap)] px-3 py-2 rounded-lg border transition-all ${cleanMissing
                        ? 'bg-btn-secondary-bg border-btn-secondary-border text-btn-secondary-fg shadow-sm'
                        : 'bg-transparent border-transparent text-muted hover:bg-btn-secondary-hover'
                        } ${missingItems.length === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                    {cleanMissing && <CheckCircle className="size-[var(--size-icon-sm)] text-status-info-fg" />}
                    {missingItems.length} Missing
                </button>

                <button
                    onClick={() => interruptedItems.length > 0 && setCleanInterrupted(!cleanInterrupted)}
                    className={`flex-1 flex items-center justify-center gap-[var(--spacing-item-gap)] px-3 py-2 rounded-lg border transition-all ${cleanInterrupted
                        ? 'bg-btn-secondary-bg border-btn-secondary-border text-btn-secondary-fg shadow-sm'
                        : 'bg-transparent border-transparent text-muted hover:bg-btn-secondary-hover'
                        } ${interruptedItems.length === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                    {cleanInterrupted && <CheckCircle className="size-[var(--size-icon-sm)] text-status-info-fg" />}
                    {interruptedItems.length} Failed
                </button>
            </div>

            <div className="flex gap-2">
                <button
                    onClick={onDetails}
                    className="py-2 px-3 rounded-lg font-medium text-muted hover:bg-border-subtle transition-colors text-xs"
                >
                    Details
                </button>
                <button
                    onClick={onClean}
                    disabled={cleaning || selectedCount === 0}
                    className="flex-1 py-2 px-4 rounded-lg font-bold text-btn-primary-fg bg-btn-primary-bg hover:bg-btn-primary-hover active:scale-95 transition-all flex items-center justify-center gap-[var(--spacing-item-gap)] disabled:opacity-50 disabled:grayscale text-sm"
                >
                    {cleaning ? <Loader2 className="size-[var(--size-icon-sm)] animate-spin" /> : 'Clean Selected'}
                </button>
            </div>
        </div>
    );
};
