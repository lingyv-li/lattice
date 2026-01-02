import { useMemo, useEffect, useState, StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

import { TabGrouperCard } from './components/TabGrouperCard';
import { DuplicateCleanerCard } from './components/DuplicateCleanerCard';
import { ConfirmationModal } from './components/ConfirmationModal';
import { Header } from './components/Header';
import { FloatingAction } from './components/FloatingAction';

import { useTabGrouper } from '../hooks/useTabGrouper';
import { useDuplicateCleaner } from '../hooks/useDuplicateCleaner';
import { useFeatureSettings } from './hooks/useFeatureSettings';
import { SettingsStorage } from '../utils/storage';
import { ErrorStorage } from '../utils/errorStorage';
import { ToastProvider } from '../context/ToastContext';
import { useToast } from '../hooks/useToast';

import { FeatureId } from '../types/features';
import { OrganizerStatus } from '../types/organizer';

// Inner App component that can use the hook
export const InnerApp = () => {
    const { showToast } = useToast();
    const { features, updateFeature } = useFeatureSettings();

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
        // Initial check
        SettingsStorage.get().then(settings => {
            if (!settings.hasCompletedOnboarding) {
                setShowOnboarding(true);
            }
        });

        // Subscribe to changes (e.g. from Welcome page)
        const unsubscribe = SettingsStorage.subscribe((changes) => {
            if (changes.hasCompletedOnboarding) {
                if (changes.hasCompletedOnboarding.newValue === true) {
                    setShowOnboarding(false);
                }
            }
        });

        return () => unsubscribe();
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
    const isApplying =
        tabGrouper.status === OrganizerStatus.Applying ||
        duplicateCleaner.status === OrganizerStatus.Applying;

    const isActionable = !isApplying && (
        (effectiveSelectedCards.has(FeatureId.TabGrouper) && (tabGrouper.previewGroups?.length || 0) > 0) ||
        (effectiveSelectedCards.has(FeatureId.DuplicateCleaner) && duplicateCleaner.duplicateCount > 0)
    );

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
        if (!isActionable) {
            if (isApplying) return "Processing...";
            if (tabGrouper.isBackgroundProcessing) return "Analyzing Tabs...";
            return "No Actions Needed";
        }

        if (effectiveSelectedCards.has(FeatureId.TabGrouper) && tabGrouper.previewGroups) {
            return "Apply Changes";
        }

        return "Organize";
    };

    if (showOnboarding) {
        return (
            <div className="h-screen w-full bg-surface flex flex-col items-center justify-center p-6 text-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center mb-6 shadow-lg">
                    <img src="/icon-backgroundless.svg" className="w-10 h-10" alt="Logo" />
                </div>
                <h1 className="text-2xl font-bold text-main mb-2">Welcome to Lattice</h1>
                <p className="text-muted mb-8 max-w-[280px]">
                    To get started, we need to set up your AI preferences.
                </p>
                <button
                    onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('src/welcome/index.html') })}
                    className="w-full max-w-[280px] py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold rounded-xl shadow-lg hover:brightness-110 active:scale-95 transition-all"
                >
                    Start Setup
                </button>
            </div>
        );
    }

    return (
        <div className="h-screen w-full bg-surface flex flex-col font-sans text-main">
            <Header />

            {/* Dashboard Content */}
            <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-3">
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

            <FloatingAction
                hasWork={!!isActionable}
                isProcessing={isApplying}
                buttonLabel={getButtonLabel()}
                onOrganize={handleOrganize}
            />

            <ConfirmationModal
                isOpen={modalConfig.isOpen}
                onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
                onConfirm={modalConfig.onConfirm}
                title={modalConfig.title}
                description={modalConfig.description}
                confirmLabel="Enable"
            />
        </div >
    );
};

export const App = () => (
    <ToastProvider>
        <InnerApp />
    </ToastProvider>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>
);
