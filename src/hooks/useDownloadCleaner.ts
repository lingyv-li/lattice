import { useState, useEffect } from 'react';
import { scanDownloads, cleanDownloads } from '../utils/cleaner';
import { getSettings } from '../utils/storage';

export interface CleanableItem {
    id: number;
    filename: string;
    url: string;
}

export const useDownloadCleaner = () => {
    const [missingItems, setMissingItems] = useState<CleanableItem[]>([]);
    const [interruptedItems, setInterruptedItems] = useState<CleanableItem[]>([]);
    const [cleanMissing, setCleanMissing] = useState(true);
    const [cleanInterrupted, setCleanInterrupted] = useState(true);
    const [loading, setLoading] = useState(true);
    const [cleaning, setCleaning] = useState(false);
    const [done, setDone] = useState(false);

    useEffect(() => {
        init();
    }, []);

    const init = async () => {
        const settings = await getSettings();
        const result = await scanDownloads();

        setMissingItems(result.missingFiles as CleanableItem[]);
        setInterruptedItems(result.interruptedFiles as CleanableItem[]);

        setCleanMissing(settings.scanMissing && result.missingFiles.length > 0);
        setCleanInterrupted(settings.scanInterrupted && result.interruptedFiles.length > 0);

        setLoading(false);
    };

    const handleClean = async () => {
        if (!cleanMissing && !cleanInterrupted) return;

        setCleaning(true);
        let ids: number[] = [];
        if (cleanMissing) ids = [...ids, ...missingItems.map(i => i.id)];
        if (cleanInterrupted) ids = [...ids, ...interruptedItems.map(i => i.id)];

        await cleanDownloads(ids);
        setCleaning(false);
        setDone(true);

        // Reset after delay
        setTimeout(() => {
            setDone(false);
            init();
        }, 2000);
    };

    return {
        missingItems,
        interruptedItems,
        cleanMissing,
        setCleanMissing,
        cleanInterrupted,
        setCleanInterrupted,
        loading,
        cleaning,
        done,
        handleClean
    };
};
