import { Sparkles, Layers, AlertCircle, Loader2 } from 'lucide-react';
import { useTabGrouper } from '../hooks/useTabGrouper';
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
        availability,
        ungroupedCount,
        generateGroups,
        applyGroups,
        cancelGroups,
        toggleGroupSelection
    } = useTabGrouper();

    // Show "clean" state when no ungrouped tabs
    if (ungroupedCount === 0 && status !== 'processing' && status !== 'initializing') {
        return <CleanState icon={Sparkles} title="AI Tab Grouper" message="All tabs organized!" />;
    }

    return (
        <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 mb-4">
            <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-purple-500" />
                <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">AI Tab Grouper</h3>
            </div>
            <p className="text-xs text-zinc-500 mb-4">
                Automatically organize your open tabs into groups using on-device AI.
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
                    onApply={applyGroups}
                    onCancel={cancelGroups}
                />
            )}

            {!previewGroups && (
                <button
                    onClick={generateGroups}
                    disabled={status === 'processing' || status === 'initializing' || availability === 'unavailable'}
                    className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale relative overflow-hidden"
                >
                    {(status === 'processing' || status === 'initializing') ? <Loader2 className="w-4 h-4 animate-spin relative z-10" /> : <Layers className="w-4 h-4 relative z-10" />}
                    <span className="relative z-10">
                        {status === 'initializing' ? `Initializing AI...` :
                            status === 'processing' ? `Organizing... ${progress ? `(${progress}%)` : ''}` :
                                status === 'success' ? "Done!" :
                                    (availability === 'downloadable' ? "Download AI & Group Tabs" : "Group Tabs")
                        }
                    </span>
                    {/* Progress Bar Background */}
                    {status === 'processing' && progress !== null && (
                        <div
                            className="absolute left-0 top-0 bottom-0 bg-purple-800 transition-all duration-300"
                            style={{ width: `${progress}%`, opacity: 0.3 }}
                        />
                    )}
                </button>
            )}
        </div>
    );
};
