import { useState } from 'react';
import { X, Sparkles, Copy, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { AIProviderType, SettingsStorage } from '../../utils/storage';
import { FeatureId } from '../../types/features';
import { TabGroupMessageType } from '../../types/tabGrouper';
import { AIService } from '../../services/ai/AIService';
import { LocalProvider } from '../../services/ai/LocalProvider';

interface OnboardingModalProps {
    isOpen: boolean;
    onComplete: () => void;
}

type OnboardingStep = 'welcome' | 'ai-setup' | 'features' | 'complete';

export const OnboardingModal = ({ isOpen, onComplete }: OnboardingModalProps) => {
    const [step, setStep] = useState<OnboardingStep>('welcome');
    const [selectedProvider, setSelectedProvider] = useState<AIProviderType>(AIProviderType.None);
    const [geminiApiKey, setGeminiApiKey] = useState('');
    const [selectedModel, setSelectedModel] = useState('');
    const [availableModels, setAvailableModels] = useState<Array<{ id: string; displayName: string }>>([]);
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [enableTabGrouper, setEnableTabGrouper] = useState(true);
    const [enableDuplicateCleaner, setEnableDuplicateCleaner] = useState(true);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);

    if (!isOpen) return null;

    const handleSkip = async () => {
        await SettingsStorage.set({ hasCompletedOnboarding: true });
        onComplete();
    };

    const handleNext = async () => {
        if (step === 'welcome') {
            setStep('ai-setup');
        } else if (step === 'ai-setup') {
            // If Local AI selected, trigger download
            if (selectedProvider === AIProviderType.Local) {
                setIsDownloading(true);
                try {
                    await LocalProvider.downloadModel((e: ProgressEvent) => {
                        const progress = e.total > 0 ? (e.loaded / e.total) : 0;
                        setDownloadProgress(Math.round(progress * 100));
                    });
                } catch (e) {
                    console.error('Failed to download model:', e);
                }
                setIsDownloading(false);
            }
            setStep('features');
        } else if (step === 'features') {
            setStep('complete');
        } else if (step === 'complete') {
            await finishOnboarding();
        }
    };

    const handleBack = () => {
        if (step === 'ai-setup') {
            setStep('welcome');
        } else if (step === 'features') {
            setStep('ai-setup');
        } else if (step === 'complete') {
            setStep('features');
        }
    };

    const finishOnboarding = async () => {
        // Save settings
        await SettingsStorage.set({
            aiProvider: selectedProvider,
            geminiApiKey: selectedProvider === AIProviderType.Gemini ? geminiApiKey : '',
            aiModel: selectedProvider === AIProviderType.Gemini ? selectedModel : '',
            hasCompletedOnboarding: true,
            features: {
                [FeatureId.TabGrouper]: { enabled: enableTabGrouper, autopilot: false },
                [FeatureId.DuplicateCleaner]: { enabled: enableDuplicateCleaner, autopilot: false }
            }
        });

        // Trigger background processing if Tab Grouper was enabled
        if (enableTabGrouper && selectedProvider !== AIProviderType.None) {
            try {
                const port = chrome.runtime.connect({ name: 'tab-grouper' });
                const win = await chrome.windows.getCurrent();
                if (win.id) {
                    port.postMessage({ type: TabGroupMessageType.TriggerProcessing, windowId: win.id });
                }
                port.disconnect();
            } catch (e) {
                console.error('Failed to trigger processing:', e);
            }
        }

        onComplete();
    };

    const handleProviderSelect = async (provider: AIProviderType) => {
        setSelectedProvider(provider);

        // If Gemini selected, fetch available models
        if (provider === AIProviderType.Gemini && geminiApiKey) {
            setIsLoadingModels(true);
            const models = await AIService.listGeminiModels(geminiApiKey);
            setAvailableModels(models);
            if (models.length > 0) {
                setSelectedModel(models[0].id);
            }
            setIsLoadingModels(false);
        }
    };

    const handleApiKeyChange = async (key: string) => {
        setGeminiApiKey(key);

        // Auto-fetch models when API key is entered
        if (key.length > 20 && selectedProvider === AIProviderType.Gemini) {
            setIsLoadingModels(true);
            const models = await AIService.listGeminiModels(key);
            setAvailableModels(models);
            if (models.length > 0) {
                setSelectedModel(models[0].id);
            }
            setIsLoadingModels(false);
        }
    };

    const canProceed = () => {
        if (step === 'welcome') return true;
        if (step === 'ai-setup') {
            if (selectedProvider === AIProviderType.None) return true;
            if (selectedProvider === AIProviderType.Local) return true;
            if (selectedProvider === AIProviderType.Gemini) {
                return geminiApiKey.length > 0 && selectedModel.length > 0;
            }
        }
        if (step === 'features') return true;
        if (step === 'complete') return true;
        return false;
    };

    const getStepNumber = () => {
        const steps = { welcome: 1, 'ai-setup': 2, features: 3, complete: 4 };
        return steps[step];
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface border border-border-subtle rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="p-6 border-b border-border-subtle flex items-center justify-between sticky top-0 bg-surface/95 backdrop-blur-sm z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center">
                            <img src="/icon-backgroundless.svg" className="w-6 h-6" alt="Logo" />
                        </div>
                        <div>
                            <h2 className="font-bold text-lg text-main">Welcome to Lattice</h2>
                            <p className="text-xs text-muted">Step {getStepNumber()} of 4</p>
                        </div>
                    </div>
                    <button
                        onClick={handleSkip}
                        className="p-2 rounded-lg text-muted hover:text-main hover:bg-surface-highlight transition-colors"
                        title="Skip onboarding"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {step === 'welcome' && (
                        <div className="space-y-6">
                            <div className="text-center space-y-3">
                                <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center">
                                    <Sparkles className="w-10 h-10 text-white" />
                                </div>
                                <h3 className="text-2xl font-bold text-main">AI-Powered Tab Management</h3>
                                <p className="text-muted text-sm leading-relaxed">
                                    Lattice uses AI to automatically organize your tabs into groups and remove duplicates,
                                    helping you stay focused and productive.
                                </p>
                            </div>

                            <div className="space-y-3">
                                <div className="p-4 bg-surface-dim rounded-lg border border-border-subtle">
                                    <div className="flex items-start gap-3">
                                        <Sparkles className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <h4 className="font-semibold text-sm text-main mb-1">Smart Tab Grouping</h4>
                                            <p className="text-xs text-muted">AI analyzes your tabs and suggests intelligent groupings</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4 bg-surface-dim rounded-lg border border-border-subtle">
                                    <div className="flex items-start gap-3">
                                        <Copy className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <h4 className="font-semibold text-sm text-main mb-1">Duplicate Detection</h4>
                                            <p className="text-xs text-muted">Automatically find and close duplicate tabs</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 'ai-setup' && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-xl font-bold text-main mb-2">Choose Your AI Provider</h3>
                                <p className="text-sm text-muted">Select how you want Lattice to process your tabs</p>
                            </div>

                            <div className="space-y-3">
                                {/* Local AI */}
                                <button
                                    onClick={() => handleProviderSelect(AIProviderType.Local)}
                                    className={`w-full p-4 rounded-lg border-2 transition-all text-left ${selectedProvider === AIProviderType.Local
                                        ? 'border-blue-500 bg-blue-500/10'
                                        : 'border-border-subtle hover:border-border-subtle/60 bg-surface-dim'
                                        }`}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <h4 className="font-semibold text-main mb-1">🤖 Local AI (Recommended)</h4>
                                            <p className="text-xs text-muted mb-2">Free • Private • Runs on your device</p>
                                            <p className="text-xs text-muted">No API key needed. Your data never leaves your computer.</p>
                                        </div>
                                        {selectedProvider === AIProviderType.Local && (
                                            <Check className="w-5 h-5 text-blue-500 flex-shrink-0" />
                                        )}
                                    </div>
                                </button>

                                {/* Gemini */}
                                <button
                                    onClick={() => handleProviderSelect(AIProviderType.Gemini)}
                                    className={`w-full p-4 rounded-lg border-2 transition-all text-left ${selectedProvider === AIProviderType.Gemini
                                        ? 'border-purple-500 bg-purple-500/10'
                                        : 'border-border-subtle hover:border-border-subtle/60 bg-surface-dim'
                                        }`}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <h4 className="font-semibold text-main mb-1">✨ Google Gemini</h4>
                                            <p className="text-xs text-muted mb-2">Cloud-based • More powerful</p>
                                            <p className="text-xs text-muted">Requires API key. Data sent to Google servers.</p>
                                        </div>
                                        {selectedProvider === AIProviderType.Gemini && (
                                            <Check className="w-5 h-5 text-purple-500 flex-shrink-0" />
                                        )}
                                    </div>
                                </button>

                                {selectedProvider === AIProviderType.Gemini && (
                                    <div className="space-y-3 pl-4 border-l-2 border-purple-500/30">
                                        <div>
                                            <label className="block text-xs font-medium text-main mb-2">
                                                API Key
                                            </label>
                                            <input
                                                type="password"
                                                value={geminiApiKey}
                                                onChange={(e) => handleApiKeyChange(e.target.value)}
                                                placeholder="Enter your Gemini API key"
                                                className="w-full px-3 py-2 bg-surface-dim border border-border-subtle rounded-lg text-sm text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-purple-500"
                                            />
                                            <a
                                                href="https://aistudio.google.com/app/apikey"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-purple-500 hover:underline mt-1 inline-block"
                                            >
                                                Get API key →
                                            </a>
                                        </div>

                                        {isLoadingModels && (
                                            <p className="text-xs text-muted">Loading models...</p>
                                        )}

                                        {availableModels.length > 0 && (
                                            <div>
                                                <label className="block text-xs font-medium text-main mb-2">
                                                    Model
                                                </label>
                                                <select
                                                    value={selectedModel}
                                                    onChange={(e) => setSelectedModel(e.target.value)}
                                                    className="w-full px-3 py-2 bg-surface-dim border border-border-subtle rounded-lg text-sm text-main focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                >
                                                    {availableModels.map((model) => (
                                                        <option key={model.id} value={model.id}>
                                                            {model.displayName}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {isDownloading && (
                                    <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                                        <p className="text-sm text-main mb-2">Downloading AI model...</p>
                                        <div className="w-full bg-surface-dim rounded-full h-2 overflow-hidden">
                                            <div
                                                className="h-full bg-blue-500 transition-all duration-300"
                                                style={{ width: `${downloadProgress}%` }}
                                            />
                                        </div>
                                        <p className="text-xs text-muted mt-1">{downloadProgress}%</p>
                                    </div>
                                )}

                                {/* Skip option */}
                                <button
                                    onClick={() => handleProviderSelect(AIProviderType.None)}
                                    className={`w-full p-3 rounded-lg border transition-all text-left ${selectedProvider === AIProviderType.None
                                        ? 'border-muted bg-surface-highlight'
                                        : 'border-transparent hover:bg-surface-highlight'
                                        }`}
                                >
                                    <p className="text-xs text-muted">Skip for now (configure later in Settings)</p>
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'features' && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-xl font-bold text-main mb-2">Enable Features</h3>
                                <p className="text-sm text-muted">Choose which features you want to use</p>
                            </div>

                            <div className="space-y-3">
                                <label className="flex items-start gap-3 p-4 bg-surface-dim rounded-lg border border-border-subtle cursor-pointer hover:bg-surface-highlight transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={enableTabGrouper}
                                        onChange={(e) => setEnableTabGrouper(e.target.checked)}
                                        className="mt-1 w-4 h-4 rounded border-border-subtle text-blue-500 focus:ring-2 focus:ring-blue-500"
                                    />
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Sparkles className="w-4 h-4 text-purple-500" />
                                            <h4 className="font-semibold text-sm text-main">AI Tab Grouper</h4>
                                        </div>
                                        <p className="text-xs text-muted">
                                            Automatically organize your tabs into intelligent groups
                                        </p>
                                    </div>
                                </label>

                                <label className="flex items-start gap-3 p-4 bg-surface-dim rounded-lg border border-border-subtle cursor-pointer hover:bg-surface-highlight transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={enableDuplicateCleaner}
                                        onChange={(e) => setEnableDuplicateCleaner(e.target.checked)}
                                        className="mt-1 w-4 h-4 rounded border-border-subtle text-blue-500 focus:ring-2 focus:ring-blue-500"
                                    />
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Copy className="w-4 h-4 text-blue-500" />
                                            <h4 className="font-semibold text-sm text-main">Duplicate Cleaner</h4>
                                        </div>
                                        <p className="text-xs text-muted">
                                            Find and close duplicate tabs automatically
                                        </p>
                                    </div>
                                </label>
                            </div>

                            {selectedProvider === AIProviderType.None && (
                                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                                    <p className="text-xs text-yellow-700 dark:text-yellow-400">
                                        ⚠️ AI Tab Grouper requires an AI provider. Configure one in Settings to use this feature.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {step === 'complete' && (
                        <div className="space-y-6 text-center">
                            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-tr from-green-500 to-emerald-500 flex items-center justify-center">
                                <Check className="w-10 h-10 text-white" />
                            </div>

                            <div>
                                <h3 className="text-2xl font-bold text-main mb-2">You're All Set!</h3>
                                <p className="text-sm text-muted">
                                    Lattice is ready to help you organize your tabs.
                                </p>
                            </div>

                            <div className="space-y-2 text-left">
                                <div className="p-3 bg-surface-dim rounded-lg">
                                    <p className="text-xs text-muted mb-1">AI Provider</p>
                                    <p className="text-sm font-medium text-main">
                                        {selectedProvider === AIProviderType.Local && '🤖 Local AI'}
                                        {selectedProvider === AIProviderType.Gemini && '✨ Google Gemini'}
                                        {selectedProvider === AIProviderType.None && '⚙️ Not configured'}
                                    </p>
                                </div>

                                <div className="p-3 bg-surface-dim rounded-lg">
                                    <p className="text-xs text-muted mb-1">Enabled Features</p>
                                    <div className="space-y-1">
                                        {enableTabGrouper && (
                                            <p className="text-sm text-main">✓ AI Tab Grouper</p>
                                        )}
                                        {enableDuplicateCleaner && (
                                            <p className="text-sm text-main">✓ Duplicate Cleaner</p>
                                        )}
                                        {!enableTabGrouper && !enableDuplicateCleaner && (
                                            <p className="text-sm text-muted">None selected</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-border-subtle bg-surface/95 backdrop-blur-sm sticky bottom-0">
                    <div className="flex items-center justify-between gap-3">
                        {step !== 'welcome' && (
                            <button
                                onClick={handleBack}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-muted hover:text-main hover:bg-surface-highlight transition-colors flex items-center gap-2"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Back
                            </button>
                        )}

                        {step === 'welcome' && (
                            <button
                                onClick={handleSkip}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-muted hover:text-main hover:bg-surface-highlight transition-colors"
                            >
                                Skip
                            </button>
                        )}

                        <button
                            onClick={handleNext}
                            disabled={!canProceed() || isDownloading}
                            className={`ml-auto px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${canProceed() && !isDownloading
                                ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:brightness-110'
                                : 'bg-surface-dim text-muted cursor-not-allowed'
                                }`}
                        >
                            {step === 'complete' ? 'Get Started' : 'Next'}
                            {step !== 'complete' && <ArrowRight className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
