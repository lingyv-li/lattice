import { useMemo, useEffect, useState, StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { Settings } from 'lucide-react';
import './index.css';
import { TabGrouperCard } from './components/TabGrouperCard';
import { DuplicateCleanerCard } from './components/DuplicateCleanerCard';
import { DownloadCleanerCard } from './components/DownloadCleanerCard';
import { ConfirmationModal } from './components/ConfirmationModal';
import { Loader2 } from 'lucide-react';

import { useTabGrouper } from '../hooks/useTabGrouper';
import { useDuplicateCleaner } from '../hooks/useDuplicateCleaner';
import { useDownloadCleaner } from '../hooks/useDownloadCleaner';
import { getSettings, saveSettings } from '../utils/storage';
import { ErrorStorage } from '../utils/errorStorage';
import { ToastProvider, useToast } from '../context/ToastContext';

// Inner App component that can use the hook
const InnerApp = () => {
    const { showToast } = useToast();
    const [modelInfo, _] = useState<string>("");
    const [autopilot, setAutopilot] = useState<Record<string, boolean>>({});

    // Modal State
    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        onConfirm: () => void;
    }>({
        isOpen: false,
        title: "",
        description: "",
        onConfirm: () => { }
    });

    // Listen for background errors via storage
    useEffect(() => {
        const unsubscribe = ErrorStorage.subscribe((errors) => {
            errors.forEach(err => showToast(err.message, 'error'));
            ErrorStorage.clearErrors();
        });

        // Check for persisted errors
        ErrorStorage.getErrors().then((errors) => {
            if (errors.length > 0) {
                errors.forEach(err => showToast(err.message, 'error'));
                ErrorStorage.clearErrors();
            }
        });

        return () => unsubscribe();
    }, [showToast]);

    // Hooks
    const tabGrouper = useTabGrouper();
    const duplicateCleaner = useDuplicateCleaner();
    const downloadCleaner = useDownloadCleaner();

    // Selection State with Persistence
    const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set(['tab-grouper', 'duplicate-cleaner']));

    // Load persisted selection
    useEffect(() => {
        getSettings().then(settings => {
            if (settings.selectedCards) {
                setSelectedCards(new Set(settings.selectedCards));
            }
            if (settings.autopilot !== undefined) {
                setAutopilot(settings.autopilot || {});
            }
        });
    }, []);

    // Persist selection changes
    useEffect(() => {
        saveSettings({ selectedCards: Array.from(selectedCards), autopilot });
    }, [selectedCards, autopilot]);

    const toggleAutopilot = (cardId: string, checked: boolean) => {
        if (checked) {
            // User is turning ON autopilot -> Warn them
            const isClosing = cardId === 'duplicate-cleaner';
            const title = isClosing ? "Enable Auto-Removal?" : "Enable Auto-Grouping?";
            const description = isClosing
                ? "This will automatically close duplicate tabs in the background. Closed tabs cannot be restored."
                : "This will automatically group new tabs as they open.";

            setModalConfig({
                isOpen: true,
                title,
                description,
                onConfirm: () => {
                    setAutopilot(prev => ({ ...prev, [cardId]: true }));
                }
            });
        } else {
            // Turning OFF -> No warning needed
            setAutopilot(prev => ({ ...prev, [cardId]: false }));
        }
    };

    const toggleCard = (id: string) => {
        const newSet = new Set(selectedCards);

        // Toggle the persistent selection state
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }

        // Feature-specific side effects
        if (id === 'tab-grouper') {
            const isNowSelected = newSet.has(id);
            // If the user toggles the card, we want to select/deselect all inner items
            tabGrouper.setAllGroupsSelected(isNowSelected);
        }

        setSelectedCards(newSet);
    };

    // Declarative Selection State:
    const effectiveSelectedCards = useMemo(() => {
        const set = new Set(selectedCards);
        if (tabGrouper.selectedPreviewIndices.size > 0) {
            set.add('tab-grouper');
        }
        return set;
    }, [selectedCards, tabGrouper.selectedPreviewIndices]);

    // Derived States uses effective set
    const isProcessing =
        tabGrouper.status === 'processing' ||
        tabGrouper.status === 'initializing' ||
        tabGrouper.isBackgroundProcessing ||
        duplicateCleaner.status === 'cleaning' ||
        downloadCleaner.cleaning;

    const hasWork =
        (effectiveSelectedCards.has('tab-grouper') && tabGrouper.previewGroups) ||
        (effectiveSelectedCards.has('duplicate-cleaner') && duplicateCleaner.duplicateCount > 0) ||
        (effectiveSelectedCards.has('download-cleaner') && (downloadCleaner.missingItems.length > 0 || downloadCleaner.interruptedItems.length > 0));

    // Handle Organize Action
    const handleOrganize = async () => {
        if (isProcessing) return;

        // 1. Duplicate Cleaner
        if (effectiveSelectedCards.has('duplicate-cleaner') && duplicateCleaner.duplicateCount > 0) {
            duplicateCleaner.closeDuplicates();
        }

        // 2. Download Cleaner
        if (effectiveSelectedCards.has('download-cleaner')) {
            downloadCleaner.handleClean();
        }

        // 3. Tab Grouper
        if (effectiveSelectedCards.has('tab-grouper')) {
            // If processing (foreground or background), do nothing
            if (tabGrouper.status === 'processing' || tabGrouper.isBackgroundProcessing) return;

            if (tabGrouper.previewGroups) {
                // If already previewing, applying
                tabGrouper.applyGroups();
            }
        }
    };

    // Determine Button Label
    const getButtonLabel = () => {
        if (isProcessing) return "Processing...";

        if (effectiveSelectedCards.has('tab-grouper') && tabGrouper.previewGroups) {
            return "Apply Changes";
        }

        if (!hasWork) return "No Actions Needed";

        return "Organize";
    };

    return (
        <div className="h-screen w-full bg-surface flex flex-col font-sans text-main">
            {/* Header */}
            <div className="p-4 border-b border-border-subtle flex items-center justify-between bg-surface/80 backdrop-blur-sm sticky top-0 z-10">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-white shadow-sm">
                        <img src="/icon-backgroundless.svg" className="w-5 h-5" alt="Logo" />
                    </div>
                    <div>
                        <h1 className="font-bold text-sm leading-tight text-main">Lattice</h1>
                        <p className="text-[10px] text-muted font-medium">AI Browser Organizer</p>
                    </div>
                </div>
                <button
                    onClick={() => chrome.runtime.openOptionsPage()}
                    className="p-2 rounded-lg text-muted hover:text-main hover:bg-surface-highlight transition-all duration-200 cursor-pointer"
                    title="Settings"
                >
                    <Settings className="w-4 h-4" />
                </button>
            </div>

            {/* Dashboard Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
                {/* Section: Organization */}
                <div className="space-y-3">
                    <h2 className="text-xs font-bold text-muted uppercase tracking-wider px-1">Tab Organization</h2>
                    <TabGrouperCard
                        isSelected={effectiveSelectedCards.has('tab-grouper')}
                        onToggle={() => toggleCard('tab-grouper')}
                        data={tabGrouper}
                        autopilotEnabled={!!autopilot['tab-grouper']}
                        onAutopilotToggle={(enabled) => toggleAutopilot('tab-grouper', enabled)}
                    />
                    <DuplicateCleanerCard
                        isSelected={effectiveSelectedCards.has('duplicate-cleaner')}
                        onToggle={() => toggleCard('duplicate-cleaner')}
                        data={duplicateCleaner}
                        autopilotEnabled={!!autopilot['duplicate-cleaner']}
                        onAutopilotToggle={(enabled) => toggleAutopilot('duplicate-cleaner', enabled)}
                    />
                </div>

                {/* Section: Optimization */}
                <div className="space-y-3">
                    <h2 className="text-xs font-bold text-muted uppercase tracking-wider px-1">Maintenance</h2>
                    <DownloadCleanerCard
                        isSelected={effectiveSelectedCards.has('download-cleaner')}
                        onToggle={() => toggleCard('download-cleaner')}
                        data={downloadCleaner}
                    />
                </div>

                <div className="text-center py-6 opacity-40">
                    <p className="text-[10px] text-muted">
                        {modelInfo}
                    </p>
                </div>
            </div>

            {/* Main Action Button - Floating Bottom */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-surface/90 backdrop-blur-md border-t border-border-subtle">
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleOrganize}
                        disabled={isProcessing || !hasWork}
                        className={`
                            flex-1 py-3 px-4 rounded-xl font-bold uppercase tracking-wide text-sm shadow-lg
                            flex items-center justify-center gap-2 transition-all active:scale-[0.98]
                            ${isProcessing || !hasWork
                                ? 'bg-surface-dim text-muted cursor-not-allowed shadow-none'
                                : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:shadow-blue-500/20 hover:brightness-110'
                            }
                        `}
                    >
                        {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
                        {getButtonLabel()}
                    </button>
                </div>
            </div>
            <ConfirmationModal
                isOpen={modalConfig.isOpen}
                onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
                onConfirm={modalConfig.onConfirm}
                title={modalConfig.title}
                description={modalConfig.description}
                confirmLabel="Enable"
            />
        </div>
    );
};

const App = () => (
    <ToastProvider>
        <InnerApp />
    </ToastProvider>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>
);
