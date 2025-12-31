import { BaseProvider } from './BaseProvider';

// Define types for the Local AI API (flaky spec)
interface NanoSession {
    prompt(text: string): Promise<string>;
    destroy(): void;
}

interface NanoFactory {
    create(options?: { initialPrompts?: { role: string, content: string }[] }): Promise<NanoSession>;
}

declare global {
    interface Window {
        ai: {
            languageModel: NanoFactory;
        };
    }
}

export class LocalProvider extends BaseProvider {
    id = 'local';

    // Static cache to persist session across multiple calls/instantiations
    private static cachedSession: NanoSession | null = null;
    private static cachedRules: string | null = null;

    // For testing purposes only
    static reset() {
        this.cachedSession = null;
        this.cachedRules = null;
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

    private async ensureLocalSession(customRules: string, systemPrompt: string, onProgress?: (loaded: number, total: number) => void) {
        // Reset if rules changed
        if (LocalProvider.cachedSession && LocalProvider.cachedRules !== customRules) {
            LocalProvider.cachedSession.destroy();
            LocalProvider.cachedSession = null;
        }

        if (!LocalProvider.cachedSession) {
            if (typeof LanguageModel === 'undefined') {
                throw new Error("AI API not supported in this browser.");
            }

            LocalProvider.cachedSession = await LanguageModel.create({
                expectedInputs: [{ type: 'text', languages: ['en'] }],
                initialPrompts: [{
                    role: "system",
                    content: systemPrompt
                }],
                monitor(m: any) {
                    m.addEventListener('downloadprogress', (e: ProgressEvent) => {
                        if (onProgress) {
                            onProgress(e.loaded, e.total);
                        }
                    });
                }
            });
            LocalProvider.cachedRules = customRules;
        }
    }

    public static async initialize(onProgress?: (loaded: number, total: number) => void) {
        const instance = new LocalProvider();
        // Just ensure session with empty prompts to trigger download if needed
        // We use a dummy system prompt just to check/init
        await instance.ensureLocalSession('', 'Initialization check', onProgress);
    }
}
