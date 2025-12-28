import { Sparkles, Layers, AlertCircle, Loader2, Download } from 'lucide-react';
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
        backgroundProcessingCount,
        generateGroups,
        applyGroups,
        cancelGroups,
        rejectGroup,
        toggleGroupSelection
    } = useTabGrouper();

    // Show "clean" state when no ungrouped tabs
    if (ungroupedCount === 0 && status !== 'processing' && status !== 'initializing') {
        return <CleanState icon={Sparkles} title="AI Tab Grouper" message="All tabs organized!" />;
    }

    // Determine if we should show the manual Group Tabs button:
    // - Show if AI needs downloading
    // - Show if there's an error
    // - Show if actively processing/initializing
    // - Hide if background processing is active and there are no suggestions yet
    const showGroupButton = (
        availability === 'downloadable' ||
        availability === 'downloading' ||
        status === 'error' ||
        status === 'processing' ||
        status === 'initializing' ||
        (!previewGroups && backgroundProcessingCount === 0)
    );

    return (
        <div className="p-4 bg-surface-dim rounded-xl border border-border-subtle mb-4">
            <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-purple-500" />
                <h3 className="font-bold text-sm text-main">AI Tab Grouper</h3>
            </div>
            <p className="text-xs text-muted mb-4">
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
                    onReject={rejectGroup}
                    onApply={applyGroups}
                    onCancel={cancelGroups}
                />
            )}

            {!previewGroups && showGroupButton && (
                <button
                    onClick={generateGroups}
                    disabled={status === 'processing' || status === 'initializing' || availability === 'unavailable'}
                    className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale relative overflow-hidden"
                >
                    {(status === 'processing' || status === 'initializing') ? <Loader2 className="w-4 h-4 animate-spin relative z-10" /> :
                        availability === 'downloadable' ? <Download className="w-4 h-4 relative z-10" /> :
                            <Layers className="w-4 h-4 relative z-10" />}
                    <span className="relative z-10">
                        {status === 'initializing' ? `Initializing AI...` :
                            status === 'processing' ? `Organizing... ${progress ? `(${progress}%)` : ''}` :
                                status === 'success' ? "Done!" :
                                    (availability === 'downloadable' ? "Download AI Model" : `Group ${ungroupedCount} Tabs`)
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

            {backgroundProcessingCount > 0 && !previewGroups && status === 'idle' && (
                <p className="text-xs text-muted mt-2 text-center">
                    <Loader2 className="w-3 h-3 inline animate-spin mr-1" />
                    Analyzing {backgroundProcessingCount} tab{backgroundProcessingCount !== 1 ? 's' : ''} in background...
                </p>
            )}
        </div>
    );
};
