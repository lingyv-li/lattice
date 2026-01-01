import { BaseProvider } from './BaseProvider';

export class LocalProvider extends BaseProvider {
    id = 'local';

    // Static cache to persist session across multiple calls/instantiations
    private static cachedSession: LanguageModel | null = null;
    private static cachedRules: string | null = null;

    // For testing purposes only
    static reset() {
        this.cachedSession = null;
        this.cachedRules = null;
    }


    public static async checkAvailability(): Promise<Availability> {
        if (typeof LanguageModel === 'undefined') {
            return 'unavailable';
        }
        try {
            const status = await LanguageModel.availability();
            return status;
        } catch (e) {
            console.error("Failed to check AI availability", e);
            return 'unavailable';
        }
    }

    protected async promptAI(
        userPrompt: string,
        systemPrompt: string,
        customRules?: string
    ): Promise<string> {
        await this.ensureLocalSession(customRules || '', systemPrompt);

        if (!LocalProvider.cachedSession) {
            throw new Error("Failed to initialize Local AI session.");
        }

        return LocalProvider.cachedSession.prompt(userPrompt);
    }

    private async ensureLocalSession(customRules: string, systemPrompt: string) {
        // Reset if rules changed
        if (LocalProvider.cachedSession && LocalProvider.cachedRules !== customRules) {
            LocalProvider.cachedSession.destroy();
            LocalProvider.cachedSession = null;
        }

        if (!LocalProvider.cachedSession) {
            if (await LocalProvider.checkAvailability() !== 'available') {
                throw new Error("Local AI is not available.");
            }

            // Create actual session for inference (no monitoring needed here as we assume model is downloaded)
            LocalProvider.cachedSession = await LanguageModel.create({
                expectedInputs: [{ type: 'text', languages: ['en'] }],
                initialPrompts: [{
                    role: "system",
                    content: systemPrompt
                }]
            });
            LocalProvider.cachedRules = customRules;
        }
    }

    public static async downloadModel(onProgress: (e: ProgressEvent) => void) {
        // Create temporary session just to trigger download/check availability with progress monitoring
        const session = await LanguageModel.create({
            expectedInputs: [{ type: 'text', languages: ['en'] }],
            monitor(m) {
                m.addEventListener('downloadprogress', (e: ProgressEvent) => {
                    onProgress(e);
                });
            }
        });

        // We only needed it for the download/verification
        session.destroy();
    }
}
