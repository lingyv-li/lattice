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

    const updateFeature = (id: FeatureId, updates: Partial<FeatureSettings>) => {
        // 1. Optimistic UI update
        setFeatures(prev => {
            const current = prev[id];
            if (!current) return prev;
            const next = { ...current, ...updates };

            // Replicate business rules for immediate feedback (autopilot/enabled)
            if (updates.enabled === false) next.autopilot = false;
            if (updates.autopilot === true && !next.enabled) next.enabled = true;

            return { ...prev, [id]: next };
        });

        // 2. Persist safely
        SettingsStorage.updateFeature(id, updates).catch(err => {
            console.error("Failed to update feature settings:", err);
            // In a more robust system, we might revert optimistic update here
        });
    };

    return {
        features,
        updateFeature
    };
};
