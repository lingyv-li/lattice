import { useState, useEffect } from 'react';
import { FeatureId } from '../../types/features';
import { SettingsStorage, FeatureSettings } from '../../utils/storage';

export const useFeatureSettings = () => {
    const [features, setFeatures] = useState<Record<FeatureId, FeatureSettings>>({
        [FeatureId.TabGrouper]: { enabled: true, autopilot: false },
        [FeatureId.DuplicateCleaner]: { enabled: true, autopilot: false }
    });

    // Load persisted selection and subscribe to changes
    useEffect(() => {
        // Initial load
        SettingsStorage.get().then(settings => {
            if (settings.features) {
                setFeatures(settings.features);
            }
        });

        // Subscribe to changes
        const unsubscribe = SettingsStorage.subscribe((changes) => {
            if (changes.features && changes.features.newValue) {
                setFeatures(changes.features.newValue as Record<FeatureId, FeatureSettings>);
            }
        });

        return () => unsubscribe();
    }, []);

    // Persist selection changes
    useEffect(() => {
        SettingsStorage.set({ features });
    }, [features]);

    const updateFeature = (id: FeatureId, updates: Partial<FeatureSettings>) => {
        setFeatures(prev => {
            const current = prev[id];
            if (!current) return prev;

            const next = { ...current, ...updates };

            // ENFORCE RULE: If enabled becomes false, autopilot must be false
            if (updates.enabled === false) {
                next.autopilot = false;
            }

            // ENFORCE RULE: Autopilot cannot be true if enabled is false.
            if (updates.autopilot === true && !next.enabled) {
                next.enabled = true;
            }

            return { ...prev, [id]: next };
        });
    };

    return {
        features,
        updateFeature
    };
};
