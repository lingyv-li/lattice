import { useState, useEffect } from 'react';
import { Sparkles, Copy, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { AIProviderType, SettingsStorage } from '../../utils/storage';
import { FeatureId } from '../../types/features';
import { TabGroupMessageType } from '../../types/tabGrouper';
import { AIService } from '../../services/ai/AIService';
import { LocalProvider } from '../../services/ai/LocalProvider';

enum OnboardingStep {
    Welcome = 'welcome',
    AISetup = 'ai-setup',
    Complete = 'complete'
}

interface OnboardingModalProps {
    onComplete: () => void;
}

export const OnboardingModal = ({ onComplete }: OnboardingModalProps) => {
    const [step, setStep] = useState<OnboardingStep>(OnboardingStep.Welcome);
    const [selectedProvider, setSelectedProvider] = useState<AIProviderType>(AIProviderType.None);
    const [geminiApiKey, setGeminiApiKey] = useState('');
    const [selectedModel, setSelectedModel] = useState('');
    const [availableModels, setAvailableModels] = useState<Array<{ id: string; displayName: string }>>([]);
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);

    // AI Availability State
    const [localAIAvailable, setLocalAIAvailable] = useState<boolean | null>(null);

    // Check Local AI Availability on Mount
    useEffect(() => {
        const checkAI = async () => {
            const status = await LocalProvider.checkAvailability();
            console.log("[Onboarding] Local AI Status:", status);

            // Cast to string to avoid strict type mismatch issues if types are inconsistent
            const statusStr = String(status);

            if (statusStr === "unavailable") {
                setLocalAIAvailable(false);
                setSelectedProvider(AIProviderType.None);
            } else {
                setLocalAIAvailable(true);
                setSelectedProvider(AIProviderType.Local);
            }
        };
        checkAI();
    }, []);

    const handleNext = async () => {
        if (step === OnboardingStep.Welcome) {
            setStep(OnboardingStep.AISetup);
        } else if (step === OnboardingStep.AISetup) {
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
                    setError("Failed to download model. Please checks your connection and try again.");
                }
                setIsDownloading(false);
            }
            await saveSettings();
            setStep(OnboardingStep.Complete);
        } else if (step === OnboardingStep.Complete) {
            await finishOnboarding();
        }
    };

    const handleBack = () => {
        if (step === OnboardingStep.AISetup) {
            setStep(OnboardingStep.Welcome);
        } else if (step === OnboardingStep.Complete) {
            setStep(OnboardingStep.AISetup);
        }
    };

    const saveSettings = async () => {
        // Save settings
        await SettingsStorage.set({
            aiProvider: selectedProvider,
            geminiApiKey: selectedProvider === AIProviderType.Gemini ? geminiApiKey : '',
            aiModel: selectedProvider === AIProviderType.Gemini ? selectedModel : '',
            hasCompletedOnboarding: true,
            features: {
                [FeatureId.TabGrouper]: { enabled: true, autopilot: false },
                [FeatureId.DuplicateCleaner]: { enabled: true, autopilot: false }
            }
        });

        // Trigger background processing if AI is configured
        if (selectedProvider !== AIProviderType.None) {
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
    };

    const finishOnboarding = async () => {
        onComplete();
    };

    const handleProviderSelect = async (provider: AIProviderType) => {
        // Prevent selecting Local if unavailable
        if (provider === AIProviderType.Local && !localAIAvailable) {
            return;
        }

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
        if (step === OnboardingStep.Welcome) return true;
        if (step === OnboardingStep.AISetup) {
            if (selectedProvider === AIProviderType.None) return true;
            if (selectedProvider === AIProviderType.Local) return true;
            if (selectedProvider === AIProviderType.Gemini) {
                return geminiApiKey.length > 0 && selectedModel.length > 0;
            }
        }
        if (step === OnboardingStep.Complete) return true;
        return false;
    };

    const getStepNumber = () => {
        const steps = { [OnboardingStep.Welcome]: 1, [OnboardingStep.AISetup]: 2, [OnboardingStep.Complete]: 3 };
        return steps[step];
    };

    return (
        <div className="bg-surface border border-border-subtle rounded-2xl shadow-2xl max-w-2xl w-full">
            {/* Header */}
            <div className="p-8 border-b border-border-subtle flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center">
                        <img src="/icon-backgroundless.svg" className="w-7 h-7" alt="Logo" />
                    </div>
                    <div>
                        <h2 className="font-bold text-xl text-main">Welcome to Lattice</h2>
                        <p className="text-sm text-muted">Step {getStepNumber()} of 3</p>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="p-8 min-h-[400px]">
                {step === OnboardingStep.Welcome && (
                    <div className="space-y-8">
                        <div className="text-center space-y-4">
                            <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center shadow-lg hover:scale-105 transition-transform">
                                <Sparkles className="w-12 h-12 text-white" />
                            </div>
                            <h3 className="text-3xl font-bold text-main">AI-Powered Tab Management</h3>
                            <p className="text-muted text-base leading-relaxed max-w-md mx-auto">
                                Lattice uses AI to automatically organize your tabs into groups and remove duplicates,
                                helping you stay focused and productive.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-6 bg-surface-dim rounded-xl border border-border-subtle hover:border-purple-500/30 transition-colors">
                                <div className="flex items-start gap-4">
                                    <Sparkles className="w-6 h-6 text-purple-500 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="font-semibold text-base text-main mb-1">Smart Tab Grouping</h4>
                                        <p className="text-sm text-muted">AI analyzes your tabs and suggests intelligent groupings</p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 bg-surface-dim rounded-xl border border-border-subtle hover:border-blue-500/30 transition-colors">
                                <div className="flex items-start gap-4">
                                    <Copy className="w-6 h-6 text-blue-500 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="font-semibold text-base text-main mb-1">Duplicate Detection</h4>
                                        <p className="text-sm text-muted">Automatically find and close duplicate tabs</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {step === OnboardingStep.AISetup && (
                    <div className="space-y-8">
                        <div className="text-center">
                            <h3 className="text-2xl font-bold text-main mb-2">Choose Your AI Provider</h3>
                            <p className="text-base text-muted">Select how you want Lattice to process your tabs</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Local AI */}
                            <button
                                onClick={() => handleProviderSelect(AIProviderType.Local)}
                                disabled={!localAIAvailable}
                                className={`relative p-6 rounded-xl border-2 transition-all text-left h-full ${selectedProvider === AIProviderType.Local
                                    ? 'border-blue-500 bg-blue-500/5'
                                    : localAIAvailable
                                        ? 'border-border-subtle hover:border-blue-500/50 hover:bg-surface-dim'
                                        : 'border-border-subtle opacity-50 cursor-not-allowed bg-zinc-100 dark:bg-zinc-900'
                                    }`}
                            >
                                <div className="flex flex-col h-full">
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="text-2xl">🤖</span>
                                        {selectedProvider === AIProviderType.Local && (
                                            <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                                                <Check className="w-4 h-4 text-white" />
                                            </div>
                                        )}
                                    </div>
                                    <h4 className="font-bold text-lg text-main mb-1">Local AI</h4>
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 text-[10px] font-bold uppercase tracking-wider">
                                            Recommended
                                        </span>
                                        <span className="px-2 py-0.5 rounded-full bg-zinc-500/10 text-zinc-500 text-[10px] font-bold uppercase tracking-wider">
                                            Private
                                        </span>
                                    </div>
                                    <p className="text-sm text-muted mt-auto">
                                        Runs entirely on your device using Chrome's built-in Nano model. No data ever leaves your computer.
                                    </p>
                                    {!localAIAvailable && localAIAvailable !== null && (
                                        <p className="text-xs text-red-500 mt-2 font-medium">
                                            ⚠️ Not available on this device
                                        </p>
                                    )}
                                    {localAIAvailable === null && (
                                        <p className="text-xs text-muted mt-2">
                                            Checking availability...
                                        </p>
                                    )}
                                </div>
                            </button>

                            {/* Gemini */}
                            <button
                                onClick={() => handleProviderSelect(AIProviderType.Gemini)}
                                className={`relative p-6 rounded-xl border-2 transition-all text-left h-full ${selectedProvider === AIProviderType.Gemini
                                    ? 'border-purple-500 bg-purple-500/5'
                                    : 'border-border-subtle hover:border-purple-500/50 hover:bg-surface-dim'
                                    }`}
                            >
                                <div className="flex flex-col h-full">
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="text-2xl">✨</span>
                                        {selectedProvider === AIProviderType.Gemini && (
                                            <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center">
                                                <Check className="w-4 h-4 text-white" />
                                            </div>
                                        )}
                                    </div>
                                    <h4 className="font-bold text-lg text-main mb-1">Google Gemini</h4>
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 text-[10px] font-bold uppercase tracking-wider">
                                            Powerful
                                        </span>
                                        <span className="px-2 py-0.5 rounded-full bg-zinc-500/10 text-zinc-500 text-[10px] font-bold uppercase tracking-wider">
                                            Cloud
                                        </span>
                                    </div>
                                    <p className="text-sm text-muted mt-auto">
                                        Using Google's most capable AI models. Requires an API key. Data is processed in the cloud.
                                    </p>
                                </div>
                            </button>
                        </div>

                        {selectedProvider === AIProviderType.Gemini && (
                            <div className="p-6 bg-surface-dim rounded-xl border border-purple-500/20 animate-in fade-in slide-in-from-top-4 duration-300">
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-main mb-2">
                                            Gemini API Key
                                        </label>
                                        <input
                                            type="password"
                                            value={geminiApiKey}
                                            onChange={(e) => handleApiKeyChange(e.target.value)}
                                            placeholder="Enter your API key"
                                            className="w-full px-4 py-3 bg-surface border border-border-subtle rounded-lg text-sm text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all shadow-sm"
                                        />
                                        <a
                                            href="https://aistudio.google.com/app/apikey"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-purple-500 hover:text-purple-600 hover:underline mt-2 inline-flex items-center gap-1"
                                        >
                                            Get a free API key <ArrowRight className="w-3 h-3" />
                                        </a>
                                    </div>

                                    {isLoadingModels && (
                                        <div className="flex items-center gap-2 text-muted text-sm">
                                            <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                                            Loading available models...
                                        </div>
                                    )}

                                    {availableModels.length > 0 && (
                                        <div>
                                            <label className="block text-sm font-medium text-main mb-2">
                                                Select Model
                                            </label>
                                            <select
                                                value={selectedModel}
                                                onChange={(e) => setSelectedModel(e.target.value)}
                                                className="w-full px-4 py-3 bg-surface border border-border-subtle rounded-lg text-sm text-main focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all shadow-sm"
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
                            </div>
                        )}

                        {isDownloading && (
                            <div className="p-6 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="font-medium text-main">Downloading AI Model...</p>
                                    <span className="text-sm font-bold text-blue-600">{downloadProgress}%</span>
                                </div>
                                <div className="w-full bg-surface-dim rounded-full h-3 overflow-hidden">
                                    <div
                                        className="h-full bg-blue-500 transition-all duration-300 ease-out"
                                        style={{ width: `${downloadProgress}%` }}
                                    />
                                </div>
                                <p className="text-xs text-muted mt-2">
                                    This enables Lattice to run privately on your device.
                                </p>
                            </div>
                        )}



                        {error && (
                            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-600 text-sm">
                                <span className="text-xl">⚠️</span>
                                {error}
                            </div>
                        )}

                        <div className="flex justify-center">
                            <button
                                onClick={() => handleProviderSelect(AIProviderType.None)}
                                className={`text-sm text-muted hover:text-main transition-colors ${selectedProvider === AIProviderType.None ? 'font-bold text-main underline decoration-2 decoration-border-subtle' : ''}`}
                            >
                                Skip setup (configure later)
                            </button>
                        </div>
                    </div>
                )}

                {step === OnboardingStep.Complete && (
                    <div className="space-y-8 text-center py-8">
                        <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-tr from-green-500 to-emerald-500 flex items-center justify-center shadow-lg animate-in zoom-in duration-300">
                            <Check className="w-12 h-12 text-white" />
                        </div>

                        <div>
                            <h3 className="text-3xl font-bold text-main mb-3">You're All Set!</h3>
                            <p className="text-base text-muted max-w-sm mx-auto">
                                Lattice is ready to keep your browser organized.
                            </p>
                        </div>

                        <div className="max-w-sm mx-auto p-6 bg-surface-dim rounded-xl border border-border-subtle text-left">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-sm text-muted">Selected Provider</p>
                                <p className="text-sm font-bold text-main">
                                    {selectedProvider === AIProviderType.Local && '🤖 Local AI'}
                                    {selectedProvider === AIProviderType.Gemini && '✨ Google Gemini'}
                                    {selectedProvider === AIProviderType.None && '⚙️ Not configured'}
                                </p>
                            </div>
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-muted">Features</p>
                                <div className="flex gap-2">
                                    <span className="w-2 h-2 rounded-full bg-green-500 mt-1.5"></span>
                                    <p className="text-sm font-medium text-main">Auto-Enabled</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-8 border-t border-border-subtle bg-surface/50 backdrop-blur-sm rounded-b-2xl">
                <div className="flex items-center justify-between gap-4">
                    {step !== OnboardingStep.Welcome ? (
                        <button
                            onClick={handleBack}
                            className="px-6 py-3 rounded-xl text-sm font-medium text-muted hover:text-main hover:bg-surface-highlight transition-colors flex items-center gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back
                        </button>
                    ) : (
                        <div></div> // Spacer
                    )}

                    {step !== OnboardingStep.Complete && (
                        <button
                            onClick={handleNext}
                            disabled={!canProceed() || isDownloading}
                            className={`px-8 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg active:scale-95 ${canProceed() && !isDownloading
                                ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:brightness-110 hover:shadow-blue-500/25'
                                : 'bg-surface-dim text-muted cursor-not-allowed shadow-none'
                                }`}
                        >
                            Next
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
