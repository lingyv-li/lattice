import { useMemo, useEffect, useState, StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { Settings } from 'lucide-react';
import './index.css';
import { TabGrouperCard } from './components/TabGrouperCard';
import { DuplicateCleanerCard } from './components/DuplicateCleanerCard';
import { ConfirmationModal } from './components/ConfirmationModal';
import { OnboardingModal } from './components/OnboardingModal';
import { Loader2 } from 'lucide-react';

import { useTabGrouper } from '../hooks/useTabGrouper';
import { useDuplicateCleaner } from '../hooks/useDuplicateCleaner';
import { SettingsStorage, FeatureSettings } from '../utils/storage';
import { ErrorStorage } from '../utils/errorStorage';
import { ToastProvider, useToast } from '../context/ToastContext';

import { FeatureId } from '../types/features';
import { OrganizerStatus } from '../types/organizer';

// Inner App component that can use the hook
const InnerApp = () => {
    const { showToast } = useToast();
    const [modelInfo, _] = useState<string>("");
    // Unified Feature State
    const [features, setFeatures] = useState<Record<FeatureId, FeatureSettings>>({
        [FeatureId.TabGrouper]: { enabled: true, autopilot: false },
        [FeatureId.DuplicateCleaner]: { enabled: true, autopilot: false }
    });

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

    // Onboarding State
    const [showOnboarding, setShowOnboarding] = useState(false);

    // Check if user has completed onboarding
    useEffect(() => {
        SettingsStorage.get().then(settings => {
            if (!settings.hasCompletedOnboarding) {
                setShowOnboarding(true);
            }
        });
    }, []);

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


    // Load persisted selection
    useEffect(() => {
        SettingsStorage.get().then(settings => {
            if (settings.features) {
                setFeatures(settings.features);
            }
        });
    }, []);

    // Persist selection changes
    useEffect(() => {
        SettingsStorage.set({ features });
    }, [features]);

    const updateFeature = (id: FeatureId, updates: Partial<FeatureSettings>) => {
        setFeatures(prev => {
            const current = prev[id];
            // Safety check
            if (!current) return prev;

            const next = { ...current, ...updates };

            // ENFORCE RULE: If enabled becomes false, autopilot must be false
            if (updates.enabled === false) {
                next.autopilot = false;
            }

            // Allow autopilot update only if enabled is true (or becoming true)
            if (updates.autopilot === true && !next.enabled) {
                // If trying to enable autopilot but feature is disabled, ignore or auto-enable?
                // Plan said: "If enabled becomes false, autopilot must be false".
                // Let's strictly enforce: Autopilot cannot be true if enabled is false.
                next.enabled = true; // Auto-enable feature if autopilot is turned on? 
                // OR prevent it. Let's just follow the 'uncheck' rule for now.
            }

            return { ...prev, [id]: next };
        });
    };

    const toggleAutopilot = (cardId: FeatureId, checked: boolean) => {
        if (checked) {
            // User is turning ON autopilot -> Warn them
            const isClosing = cardId === FeatureId.DuplicateCleaner;
            const title = isClosing ? "Enable Auto-Removal?" : "Enable Auto-Grouping?";
            const description = isClosing
                ? "This will automatically close duplicate tabs in the background. Closed tabs cannot be restored."
                : "This will automatically group new tabs as they open.";

            setModalConfig({
                isOpen: true,
                title,
                description,
                onConfirm: () => {
                    updateFeature(cardId, { autopilot: true });
                }
            });
        } else {
            // Turning OFF -> No warning needed
            updateFeature(cardId, { autopilot: false });
        }
    };



    // Declarative Selection State:
    const effectiveSelectedCards = useMemo(() => {
        const set = new Set<FeatureId>();
        if (features[FeatureId.TabGrouper]?.enabled) set.add(FeatureId.TabGrouper);
        if (features[FeatureId.DuplicateCleaner]?.enabled) set.add(FeatureId.DuplicateCleaner);
        return set;
    }, [features]);

    const toggleCard = (id: FeatureId) => {
        const isEnabled = features[id]?.enabled ?? false;

        // Feature-specific side effects
        if (id === FeatureId.TabGrouper) {
            // We are about to toggle it. If it WAS enabled, it will become disabled.
            // setAllGroupsSelected should reflect the NEW state.
            tabGrouper.setAllGroupsSelected(!isEnabled);
        }

        updateFeature(id, { enabled: !isEnabled });
    };

    // Derived States uses effective set
    const isProcessing =
        tabGrouper.status === OrganizerStatus.Applying ||
        duplicateCleaner.status === OrganizerStatus.Applying;

    const hasWork =
        (effectiveSelectedCards.has(FeatureId.TabGrouper) && tabGrouper.previewGroups) ||
        (effectiveSelectedCards.has(FeatureId.DuplicateCleaner) && duplicateCleaner.duplicateCount > 0);

    // Handle Organize Action
    const handleOrganize = async () => {
        // 1. Duplicate Cleaner
        if (effectiveSelectedCards.has(FeatureId.DuplicateCleaner) && duplicateCleaner.duplicateCount > 0) {
            duplicateCleaner.closeDuplicates();
        }

        // 2. Tab Grouper
        if (effectiveSelectedCards.has(FeatureId.TabGrouper)) {
            if (tabGrouper.previewGroups) {
                // If already previewing, applying
                tabGrouper.applyGroups();
            }
        }
    };

    // Determine Button Label
    const getButtonLabel = () => {
        if (effectiveSelectedCards.has(FeatureId.TabGrouper) && tabGrouper.previewGroups) {
            return "Apply Changes";
        }

        if (!hasWork) {
            if (isProcessing) {
                return "Processing...";
            } else {
                return "No Actions Needed";
            }
        }

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
                        <p className="text-[10px] text-muted font-medium">AI Tab Manager</p>
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
                        isSelected={effectiveSelectedCards.has(FeatureId.TabGrouper)}
                        onToggle={() => toggleCard(FeatureId.TabGrouper)}
                        data={tabGrouper}
                        autopilotEnabled={!!features[FeatureId.TabGrouper]?.autopilot}
                        onAutopilotToggle={(enabled) => toggleAutopilot(FeatureId.TabGrouper, enabled)}
                    />
                    <DuplicateCleanerCard
                        isSelected={effectiveSelectedCards.has(FeatureId.DuplicateCleaner)}
                        onToggle={() => toggleCard(FeatureId.DuplicateCleaner)}
                        data={duplicateCleaner}
                        autopilotEnabled={!!features[FeatureId.DuplicateCleaner]?.autopilot}
                        onAutopilotToggle={(enabled) => toggleAutopilot(FeatureId.DuplicateCleaner, enabled)}
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
                        disabled={!hasWork}
                        className={`
                            flex-1 py-3 px-4 rounded-xl font-bold uppercase tracking-wide text-sm shadow-lg
                            flex items-center justify-center gap-2 transition-all active:scale-[0.98]
                            ${!hasWork
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
            <OnboardingModal
                isOpen={showOnboarding}
                onComplete={() => {
                    setShowOnboarding(false);
                    // Reload settings after onboarding
                    SettingsStorage.get().then(settings => {
                        if (settings.features) {
                            setFeatures(settings.features);
                        }
                    });
                }}
            />
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
