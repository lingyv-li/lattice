import React from 'react';
import { Check, ArrowRight } from 'lucide-react';
import { AIProviderType } from '../../../utils/storage';

interface OnboardingAISetupProps {
    selectedProvider: AIProviderType;
    localAIAvailable: boolean | null;
    geminiApiKey: string;
    selectedModel: string;
    availableModels: Array<{ id: string; displayName: string }>;
    isLoadingModels: boolean;
    isDownloading: boolean;
    downloadProgress: number;
    error: string | null;
    onProviderSelect: (provider: AIProviderType) => void;
    onApiKeyChange: (key: string) => void;
    onModelSelect: (model: string) => void;
}

export const OnboardingAISetup: React.FC<OnboardingAISetupProps> = ({
    selectedProvider,
    localAIAvailable,
    geminiApiKey,
    selectedModel,
    availableModels,
    isLoadingModels,
    isDownloading,
    downloadProgress,
    error,
    onProviderSelect,
    onApiKeyChange,
    onModelSelect
}) => {
    return (
        <div className='space-y-8 animate-in fade-in slide-in-from-right-4 duration-300'>
            <div className='text-center'>
                <h3 className='text-2xl font-bold text-main mb-2'>Choose Your AI Provider</h3>
                <p className='text-base text-muted'>Select how you want Lattice to process your tabs</p>
            </div>

            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                {/* Local AI */}
                <button
                    onClick={() => onProviderSelect(AIProviderType.Local)}
                    disabled={!localAIAvailable}
                    className={`relative p-6 rounded-xl border-2 transition-all text-left h-full ${
                        selectedProvider === AIProviderType.Local
                            ? 'border-brand-local bg-status-info-bg'
                            : localAIAvailable
                              ? 'border-border-subtle hover:border-brand-local/50 hover:bg-surface-dim'
                              : 'border-border-subtle opacity-50 cursor-not-allowed bg-zinc-100 dark:bg-zinc-900'
                    }`}
                >
                    <div className='flex flex-col h-full'>
                        <div className='flex items-center justify-between mb-4'>
                            <span className='text-2xl'>🤖</span>
                            {selectedProvider === AIProviderType.Local && (
                                <div className='w-6 h-6 rounded-full bg-brand-local flex items-center justify-center'>
                                    <Check className='w-4 h-4 text-inverted' />
                                </div>
                            )}
                        </div>
                        <h4 className='font-bold text-lg text-main mb-1'>Local AI</h4>
                        <div className='flex items-center gap-2 mb-3'>
                            <span className='px-2 py-0.5 rounded-full bg-status-success-bg text-status-success-fg text-[10px] font-bold uppercase tracking-wider'>Recommended</span>
                            <span className='px-2 py-0.5 rounded-full bg-surface-highlight text-muted text-[10px] font-bold uppercase tracking-wider'>Private</span>
                        </div>
                        <p className='text-sm text-muted mt-auto'>Runs entirely on your device using Chrome's built-in Nano model. No data ever leaves your computer.</p>
                        {!localAIAvailable && localAIAvailable !== null && <p className='text-xs text-red-500 mt-2 font-medium'>⚠️ Not available on this device</p>}
                        {localAIAvailable === null && <p className='text-xs text-muted mt-2'>Checking availability...</p>}
                    </div>
                </button>

                {/* Gemini */}
                <button
                    onClick={() => onProviderSelect(AIProviderType.Gemini)}
                    className={`relative p-6 rounded-xl border-2 transition-all text-left h-full ${
                        selectedProvider === AIProviderType.Gemini ? 'border-brand-cloud bg-status-ai-bg' : 'border-border-subtle hover:border-brand-cloud/50 hover:bg-surface-dim'
                    }`}
                >
                    <div className='flex flex-col h-full'>
                        <div className='flex items-center justify-between mb-4'>
                            <span className='text-2xl'>✨</span>
                            {selectedProvider === AIProviderType.Gemini && (
                                <div className='w-6 h-6 rounded-full bg-brand-cloud flex items-center justify-center'>
                                    <Check className='w-4 h-4 text-inverted' />
                                </div>
                            )}
                        </div>
                        <h4 className='font-bold text-lg text-main mb-1'>Google Gemini</h4>
                        <div className='flex items-center gap-2 mb-3'>
                            <span className='px-2 py-0.5 rounded-full bg-status-ai-bg text-status-ai-fg text-[10px] font-bold uppercase tracking-wider'>Powerful</span>
                            <span className='px-2 py-0.5 rounded-full bg-surface-highlight text-muted text-[10px] font-bold uppercase tracking-wider'>Cloud</span>
                        </div>
                        <p className='text-sm text-muted mt-auto'>Using Google's most capable AI models. Requires an API key. Data is processed in the cloud.</p>
                    </div>
                </button>
            </div>

            {selectedProvider === AIProviderType.Gemini && (
                <div className='p-6 bg-surface-dim rounded-xl border border-purple-500/20 animate-in fade-in slide-in-from-top-4 duration-300'>
                    <div className='space-y-4'>
                        <div>
                            <label className='block text-sm font-medium text-main mb-2'>Gemini API Key</label>
                            <input
                                type='password'
                                value={geminiApiKey}
                                onChange={e => onApiKeyChange(e.target.value)}
                                placeholder='Enter your API key'
                                className='w-full px-4 py-3 bg-surface border border-border-subtle rounded-lg text-sm text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-cloud transition-all shadow-sm'
                            />
                            <a
                                href='https://aistudio.google.com/app/apikey'
                                target='_blank'
                                rel='noopener noreferrer'
                                className='text-xs text-brand-cloud hover:underline mt-2 inline-flex items-center gap-1'
                            >
                                Get a free API key <ArrowRight className='w-3 h-3' />
                            </a>
                        </div>

                        {isLoadingModels && (
                            <div className='flex items-center gap-2 text-muted text-sm'>
                                <div className='w-4 h-4 border-2 border-brand-cloud border-t-transparent rounded-full animate-spin'></div>
                                Loading available models...
                            </div>
                        )}

                        {availableModels.length > 0 && (
                            <div>
                                <label className='block text-sm font-medium text-main mb-2'>Select Model</label>
                                <select
                                    value={selectedModel}
                                    onChange={e => onModelSelect(e.target.value)}
                                    className='w-full px-4 py-3 bg-surface border border-border-subtle rounded-lg text-sm text-main focus:outline-none focus:ring-2 focus:ring-brand-cloud transition-all shadow-sm'
                                >
                                    {availableModels.map(model => (
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
                <div className='p-6 bg-status-info-bg border border-brand-local/20 rounded-xl'>
                    <div className='flex items-center justify-between mb-3'>
                        <p className='font-medium text-main'>Downloading AI Model...</p>
                        <span className='text-sm font-bold text-brand-local'>{downloadProgress}%</span>
                    </div>
                    <div className='w-full bg-surface-dim rounded-full h-3 overflow-hidden'>
                        <div className='h-full bg-brand-local transition-all duration-300 ease-out' style={{ width: `${downloadProgress}%` }} />
                    </div>
                    <p className='text-xs text-muted mt-2'>This enables Lattice to run privately on your device.</p>
                </div>
            )}

            {error && (
                <div className='p-4 bg-status-error-bg border border-status-error-fg/20 rounded-xl flex items-center gap-3 text-status-error-fg text-sm'>
                    <span className='text-xl'>⚠️</span>
                    {error}
                </div>
            )}

            <div className='flex justify-center'>
                <button
                    onClick={() => onProviderSelect(AIProviderType.None)}
                    className={`text-sm text-muted hover:text-main transition-colors ${selectedProvider === AIProviderType.None ? 'font-bold text-main underline decoration-2 decoration-border-subtle' : ''}`}
                >
                    Skip setup (configure later)
                </button>
            </div>
        </div>
    );
};
