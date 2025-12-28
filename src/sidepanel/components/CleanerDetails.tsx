import { ArrowLeft, FileQuestion, Ban } from 'lucide-react';
import { CleanableItem } from '../../hooks/useDownloadCleaner';

interface CleanerDetailsProps {
    missingItems: CleanableItem[];
    interruptedItems: CleanableItem[];
    onBack: () => void;
}

export const CleanerDetails = ({ missingItems, interruptedItems, onBack }: CleanerDetailsProps) => {
    return (
        <div className="fixed inset-0 z-50 bg-surface flex flex-col font-sans">
            <div className="flex items-center p-4 border-b border-border-subtle">
                <button
                    onClick={onBack}
                    className="p-2 -ml-2 rounded-full hover:bg-surface-dim text-muted transition-colors cursor-pointer"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="font-bold text-main ml-2">Cleanable Items</h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {missingItems.length > 0 && (
                    <div>
                        <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-2 flex items-center gap-2">
                            <FileQuestion className="w-3 h-3" />
                            Missing Files ({missingItems.length})
                        </h3>
                        <div className="space-y-1">
                            {missingItems.map(item => (
                                <div key={item.id} className="text-sm p-3 rounded-lg bg-surface-dim break-all">
                                    <div className="font-medium text-main line-clamp-1">{item.filename}</div>
                                    <div className="text-xs text-muted font-mono mt-0.5 opacity-60 line-clamp-1">{item.url}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {interruptedItems.length > 0 && (
                    <div>
                        <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-2 flex items-center gap-2">
                            <Ban className="w-3 h-3" />
                            Interrupted Downloads ({interruptedItems.length})
                        </h3>
                        <div className="space-y-1">
                            {interruptedItems.map(item => (
                                <div key={item.id} className="text-sm p-3 rounded-lg bg-surface-dim break-all">
                                    <div className="font-medium text-main line-clamp-1">{item.filename}</div>
                                    <div className="text-xs text-muted font-mono mt-0.5 opacity-60 line-clamp-1">{item.url}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
