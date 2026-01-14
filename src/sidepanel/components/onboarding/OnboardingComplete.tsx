import React from 'react';
import { Check } from 'lucide-react';
import { AIProviderType } from '../../../utils/storage';

interface OnboardingCompleteProps {
    selectedProvider: AIProviderType;
}

export const OnboardingComplete: React.FC<OnboardingCompleteProps> = ({ selectedProvider }) => {
    return (
        <div className="space-y-8 text-center py-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="w-24 h-24 mx-auto rounded-full bg-gradient-success flex items-center justify-center shadow-lg animate-in zoom-in duration-300">
                <Check className="w-12 h-12 text-inverted" />
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
    );
};
