import { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { AIProviderType, SettingsStorage } from '../../utils/storage';
import { FeatureId } from '../../types/features';
import { TabGroupMessageType } from '../../types/tabGrouper';
import { AIService } from '../../services/ai/AIService';
import { LocalProvider } from '../../services/ai/LocalProvider';
import { OnboardingWelcome } from './onboarding/OnboardingWelcome';
import { OnboardingAISetup } from './onboarding/OnboardingAISetup';
import { OnboardingComplete } from './onboarding/OnboardingComplete';

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
            setError(null);
            try {
                const models = await AIService.listGeminiModels(geminiApiKey);
                setAvailableModels(models);
                if (models.length > 0) {
                    setSelectedModel(models[0].id);
                }
            } catch (e) {
                console.error("Failed to list models", e);
                setError(e instanceof Error ? e.message : "Failed to fetch models");
                setAvailableModels([]);
            } finally {
                setIsLoadingModels(false);
            }
        }
    };

    const handleApiKeyChange = async (key: string) => {
        setGeminiApiKey(key);

        // Auto-fetch models when API key is entered
        if (key.length > 20 && selectedProvider === AIProviderType.Gemini) {
            setIsLoadingModels(true);
            setError(null);
            try {
                const models = await AIService.listGeminiModels(key);
                setAvailableModels(models);
                if (models.length > 0) {
                    setSelectedModel(models[0].id);
                }
            } catch (e) {
                console.error("Failed to list models", e);
                // Don't show error immediately while typing, unless it's a specific API error?
                // Actually, if the key is > 20 chars, we are attempting a fetch. If it fails, we should probably show why.
                setError(e instanceof Error ? e.message : "Failed to fetch models");
                setAvailableModels([]);
            } finally {
                setIsLoadingModels(false);
            }
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
                    <div className="w-12 h-12 rounded-full bg-gradient-brand flex items-center justify-center">
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
                {step === OnboardingStep.Welcome && <OnboardingWelcome />}

                {step === OnboardingStep.AISetup && (
                    <OnboardingAISetup
                        selectedProvider={selectedProvider}
                        localAIAvailable={localAIAvailable}
                        geminiApiKey={geminiApiKey}
                        selectedModel={selectedModel}
                        availableModels={availableModels}
                        isLoadingModels={isLoadingModels}
                        isDownloading={isDownloading}
                        downloadProgress={downloadProgress}
                        error={error}
                        onProviderSelect={handleProviderSelect}
                        onApiKeyChange={handleApiKeyChange}
                        onModelSelect={setSelectedModel}
                    />
                )}

                {step === OnboardingStep.Complete && (
                    <OnboardingComplete selectedProvider={selectedProvider} />
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

                    <button
                        onClick={handleNext}
                        disabled={!canProceed() || isDownloading}
                        className={`px-8 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg active:scale-95 ${canProceed() && !isDownloading
                            ? 'bg-gradient-brand text-inverted hover:brightness-110 hover:shadow-brand-local/25'
                            : 'bg-surface-dim text-muted cursor-not-allowed shadow-none'
                            }`}
                    >
                        {step === OnboardingStep.Complete ? 'Finish' : 'Next'}
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
};

