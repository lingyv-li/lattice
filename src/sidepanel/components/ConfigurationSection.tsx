import React from 'react';
import { Zap, Power } from 'lucide-react';
import { useFeatureSettings } from '../hooks/useFeatureSettings';
import { FeatureId } from '../../types/features';

import { ConfirmationModal } from './ConfirmationModal';

export const ConfigurationSection: React.FC = () => {
    const { features, updateFeature } = useFeatureSettings();
    const [confirmingAutopilotId, setConfirmingAutopilotId] = React.useState<FeatureId | null>(null);

    const toggleFeature = (id: FeatureId, field: 'enabled' | 'autopilot') => {
        const current = features[id];
        if (!current) return;

        const newValue = !current[field];

        // Require confirmation when enabling Autopilot
        if (field === 'autopilot' && newValue === true) {
            setConfirmingAutopilotId(id);
            return;
        }

        updateFeature(id, { [field]: newValue });
    };

    const handleConfirmAutopilot = () => {
        if (confirmingAutopilotId) {
            updateFeature(confirmingAutopilotId, { autopilot: true });
            setConfirmingAutopilotId(null);
        }
    };

    const renderToggle = (id: FeatureId, label: string) => {
        const feature = features[id];
        const isEnabled = feature?.enabled;
        const isAutopilot = feature?.autopilot;

        return (
            <div className='flex items-center justify-between p-2 rounded-lg hover:bg-surface-highlight transition-colors'>
                <span className='text-sm font-medium text-main'>{label}</span>
                <div className='flex items-center gap-2'>
                    {/* Enable Toggle */}
                    <button
                        type='button'
                        onClick={() => toggleFeature(id, 'enabled')}
                        className={`
                            p-1.5 rounded-md transition-all focus-visible:ring-2 focus-visible:ring-brand-local focus-visible:outline-none focus-visible:ring-offset-1
                            ${isEnabled ? 'bg-btn-primary-bg text-btn-primary-fg hover:bg-btn-primary-hover' : 'bg-surface-dim text-muted hover:text-main'}
                        `}
                        title={isEnabled ? 'Disable Feature' : 'Enable Feature'}
                        aria-label={isEnabled ? `Disable ${label}` : `Enable ${label}`}
                    >
                        <Power className='w-3.5 h-3.5' />
                    </button>

                    {/* Autopilot Toggle */}
                    <button
                        type='button'
                        onClick={() => toggleFeature(id, 'autopilot')}
                        disabled={!isEnabled}
                        className={`
                            p-1.5 rounded-md transition-all border focus-visible:ring-2 focus-visible:ring-brand-local focus-visible:outline-none focus-visible:ring-offset-1
                            ${!isEnabled ? 'opacity-30 cursor-not-allowed border-transparent' : ''}
                            ${isAutopilot && isEnabled ? 'bg-status-ai-bg text-status-ai-fg border-status-ai-fg/20' : 'bg-surface-dim text-muted hover:text-main border-transparent'}
                        `}
                        title={isAutopilot ? 'Disable Autopilot' : 'Enable Autopilot'}
                        aria-label={isAutopilot ? `Disable Autopilot for ${label}` : `Enable Autopilot for ${label}`}
                    >
                        <Zap className='w-3.5 h-3.5' />
                    </button>
                </div>
            </div>
        );
    };

    return (
        <>
            <div className='grid grid-cols-2 gap-2'>
                {renderToggle(FeatureId.TabGrouper, 'Auto Grouping')}
                {renderToggle(FeatureId.DuplicateCleaner, 'Deduplication')}
            </div>

            <ConfirmationModal
                isOpen={!!confirmingAutopilotId}
                onClose={() => setConfirmingAutopilotId(null)}
                onConfirm={handleConfirmAutopilot}
                title='Enable Autopilot'
                description='This will automatically apply suggestions without your manual approval. Are you sure?'
                confirmLabel='Confirm'
            />
        </>
    );
};
