import { Sparkles, AlertCircle, Loader2 } from 'lucide-react';
import { useTabGrouper } from '../hooks/useTabGrouper';
import { TabGrouperStatus } from '../types/tabGrouper';
import { TabGroupPreview } from './components/TabGroupPreview';
import { CleanState } from './components/CleanState';

export const TabGrouper = () => {
    const {
        status,
        error,
        progress,
        previewGroups,
        selectedPreviewIndices,
        tabDataMap,
        ungroupedCount,
        isBackgroundProcessing,
        toggleGroupSelection
    } = useTabGrouper();

    // Show "clean" state when no ungrouped tabs
    if (ungroupedCount === 0 && status !== TabGrouperStatus.Processing && status !== TabGrouperStatus.Initializing) {
        return <CleanState icon={Sparkles} title="AI Tab Grouper" message="All tabs organized!" />;
    }

    const isProcessing = status === TabGrouperStatus.Processing || status === TabGrouperStatus.Initializing || isBackgroundProcessing;

    return (
        <div className="p-4 bg-surface-dim rounded-xl border border-border-subtle mb-4">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-500" />
                    <h3 className="font-bold text-sm text-main">AI Tab Grouper</h3>
                </div>
            </div>

            <p className="text-xs text-muted mb-4">
                Automatically organize your open tabs into groups using AI.
            </p>

            {error && (
                <div className="mb-3 p-2 text-xs bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                </div>
            )}

            {previewGroups && (
                <TabGroupPreview
                    previewGroups={previewGroups}
                    selectedPreviewIndices={selectedPreviewIndices}
                    tabDataMap={tabDataMap}
                    onToggleSelection={toggleGroupSelection}
                />
            )}

            {isProcessing && !previewGroups && (
                <div className="py-4 flex flex-col items-center justify-center text-muted gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                    <span className="text-xs">
                        {status === TabGrouperStatus.Initializing ? 'Initializing AI...' :
                            status === TabGrouperStatus.Processing ? `Analyzing tabs... ${progress ? `(${progress}%)` : ''}` :
                                'Analyzing tabs in background...'}
                    </span>
                    {progress !== null && (
                        <div className="w-32 h-1 bg-surface-hover rounded-full overflow-hidden mt-1">
                            <div
                                className="h-full bg-purple-500 transition-all duration-300"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
