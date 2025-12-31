
export interface GlobalError {
    message: string;
    timestamp: number;
}

const STORAGE_KEY = 'globalErrors';

type ErrorChanges = {
    [STORAGE_KEY]?: chrome.storage.StorageChange;
};

export const ErrorStorage = {
    /**
     * Fetch all persisted errors.
     */
    getErrors: async (): Promise<GlobalError[]> => {
        try {
            const session = await chrome.storage.session.get(STORAGE_KEY);
            return (session[STORAGE_KEY] || []) as GlobalError[];
        } catch (e) {
            console.error('Failed to get errors from storage', e);
            return [];
        }
    },

    /**
     * Add a new error to the stack.
     */
    addError: async (message: string): Promise<void> => {
        try {
            const errors = await ErrorStorage.getErrors();
            errors.push({
                message,
                timestamp: Date.now()
            });
            // Optional: Limit stack size if needed in future
            await chrome.storage.session.set({ [STORAGE_KEY]: errors });
        } catch (e) {
            console.error('Failed to add error to storage', e);
        }
    },

    /**
     * Check if there are any errors.
     */
    hasErrors: async (): Promise<boolean> => {
        const errors = await ErrorStorage.getErrors();
        return errors.length > 0;
    },

    /**
     * Clear all errors.
     */
    clearErrors: async (): Promise<void> => {
        try {
            await chrome.storage.session.remove(STORAGE_KEY);
        } catch (e) {
            console.error('Failed to clear errors', e);
        }
    },

    /**
     * Subscribe to new errors.
     * Returns a function to unsubscribe.
     */
    subscribe: (callback: (errors: GlobalError[]) => void): () => void => {
        const handleStorageChange = (changes: ErrorChanges, areaName: string) => {
            if (areaName === 'session' && changes[STORAGE_KEY]?.newValue) {
                const errors = changes[STORAGE_KEY].newValue as GlobalError[];
                if (Array.isArray(errors) && errors.length > 0) {
                    callback(errors);
                }
            }
        };

        chrome.storage.onChanged.addListener(handleStorageChange);
        return () => chrome.storage.onChanged.removeListener(handleStorageChange);
    }
};
