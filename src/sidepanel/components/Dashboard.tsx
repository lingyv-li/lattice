import { useState, useEffect } from 'react';
import { Header } from './Header';
import { SuggestionList } from './SuggestionList';
import { ConfigurationSection } from './ConfigurationSection';
import { SettingsStorage } from '../../utils/storage';
import { ErrorStorage } from '../../utils/errorStorage';
import { useToast } from '../../hooks/useToast';
import { useTabGrouper } from '../../hooks/useTabGrouper';

export const Dashboard = () => {
    const { showToast } = useToast();
    const { isBackgroundProcessing } = useTabGrouper();
    const [showOnboarding, setShowOnboarding] = useState(false);

    // Check if user has completed onboarding
    useEffect(() => {
        SettingsStorage.get().then(settings => {
            if (!settings.hasCompletedOnboarding) {
                setShowOnboarding(true);
            }
        });

        const unsubscribe = SettingsStorage.subscribe((changes) => {
            if (changes.hasCompletedOnboarding?.newValue === true) {
                setShowOnboarding(false);
            }
        });

        return () => unsubscribe();
    }, []);

    // Listen for background errors
    useEffect(() => {
        const unsubscribe = ErrorStorage.subscribe((errors) => {
            errors.forEach(err => showToast(err.message, 'error'));
            ErrorStorage.clearErrors();
        });

        ErrorStorage.getErrors().then((errors) => {
            if (errors.length > 0) {
                errors.forEach(err => showToast(err.message, 'error'));
                ErrorStorage.clearErrors();
            }
        });

        return () => unsubscribe();
    }, [showToast]);

    if (showOnboarding) {
        return (
            <div className="h-screen w-full bg-surface flex flex-col items-center justify-center p-6 text-center">
                <div className="w-16 h-16 rounded-full bg-gradient-brand flex items-center justify-center mb-6 shadow-lg">
                    <img src="/icon-backgroundless.svg" className="w-10 h-10" alt="Logo" />
                </div>
                <h1 className="text-2xl font-bold text-main mb-2">Welcome to Lattice</h1>
                <p className="text-muted mb-8 max-w-[280px]">
                    To get started, we need to set up your AI preferences.
                </p>
                <button
                    onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('src/welcome/index.html') })}
                    className="w-full max-w-[280px] py-3 bg-gradient-brand text-inverted font-bold rounded-xl shadow-lg hover:brightness-110 active:scale-95 transition-all"
                >
                    Start Setup
                </button>
            </div>
        );
    }

    return (
        <div className="w-full bg-surface flex flex-col font-sans text-main">
            <Header isLoading={isBackgroundProcessing} />
            <div className="flex-1 overflow-y-auto">
                <SuggestionList />
            </div>

            {/* Footer Configuration */}
            <div className="p-3 bg-surface-dim/30 border-t border-border-subtle mt-auto">
                <ConfigurationSection />
            </div>
        </div>
    );
};
