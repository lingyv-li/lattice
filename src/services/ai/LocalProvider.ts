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

    private async ensureLocalSession(customRules: string, systemPrompt: string) {
        // Reset if rules changed
        if (LocalProvider.cachedSession && LocalProvider.cachedRules !== customRules) {
            LocalProvider.cachedSession.destroy();
            LocalProvider.cachedSession = null;
        }

        if (!LocalProvider.cachedSession) {
            const factory = self.ai?.languageModel || self.LanguageModel;
            if (!factory) {
                throw new Error("AI API not supported in this browser.");
            }

            LocalProvider.cachedSession = await factory.create({
                initialPrompts: [{
                    role: "system",
                    content: systemPrompt
                }]
            });
            LocalProvider.cachedRules = customRules;
        }
    }
}
