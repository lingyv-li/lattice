import { BaseProvider } from './BaseProvider';
import { constructSystemPrompt } from './shared';
import { AIProviderError, AbortError } from '../../utils/AppError';

export class LocalProvider extends BaseProvider {
    id = 'local';

    private static cachedSession: LanguageModel | null = null;
    private static cachedSystemPrompt: string | null = null;

    // For testing purposes only
    static reset() {
        if (LocalProvider.cachedSession) {
            LocalProvider.cachedSession.destroy();
            LocalProvider.cachedSession = null;
        }
        LocalProvider.cachedSystemPrompt = null;
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

    protected getSystemPrompt(customRules?: string): string {
        return constructSystemPrompt(customRules, true);
    }

    private async getSession(systemPrompt: string, signal: AbortSignal): Promise<LanguageModel> {
        if (LocalProvider.cachedSession && LocalProvider.cachedSystemPrompt === systemPrompt) {
            const cloneStart = Date.now();
            const session = await LocalProvider.cachedSession.clone();
            console.log(`[LocalProvider] Cloned session (took ${Date.now() - cloneStart}ms)`);
            return session;
        }

        if (LocalProvider.cachedSession) {
            console.log(`[LocalProvider] [${new Date().toISOString()}] System prompt changed, destroying stale session`);
            LocalProvider.cachedSession.destroy();
            LocalProvider.cachedSession = null;
        }

        const params = await LanguageModel.params();
        console.log(`[LocalProvider] [${new Date().toISOString()}] Creating new base session with temp 0.2, topK ${params.defaultTopK}`);
        const sessionCreateStart = Date.now();
        LocalProvider.cachedSession = await LanguageModel.create({
            temperature: 0.2,
            topK: params.defaultTopK,
            expectedInputs: [{ type: 'text', languages: ['en'] }],
            initialPrompts: [{
                role: "system",
                content: systemPrompt
            }],
            signal
        });
        const sessionCreateDuration = Date.now() - sessionCreateStart;
        console.log(`[LocalProvider] Base session ready (took ${sessionCreateDuration}ms)`);
        LocalProvider.cachedSystemPrompt = systemPrompt;

        const cloneStart = Date.now();
        const session = await LocalProvider.cachedSession.clone();
        console.log(`[LocalProvider] Cloned initial session (took ${Date.now() - cloneStart}ms)`);
        return session;
    }

    protected async promptAI(
        userPrompt: string,
        systemPrompt: string,
        signal: AbortSignal
    ): Promise<string> {
        if (await LocalProvider.checkAvailability() !== 'available') {
            throw new AIProviderError("Local AI is not available.");
        }

        // Clone the session for this specific request
        // This is lightweight and isolates context
        const session = await this.getSession(systemPrompt, signal);

        const startTime = Date.now();
        console.log(`[LocalProvider] [${new Date().toISOString()}] Sending single-turn CoD prompt`);
        try {

            const response = await session.prompt(userPrompt, { signal });

            const totalDuration = Date.now() - startTime;
            console.log(`[LocalProvider] CoD complete (took ${totalDuration}ms). Parsing response...`);

            const parts = response.split('####');
            let jsonPart = response;
            if (parts.length > 1) {
                console.log(`[LocalProvider] Found CoD separator. Draft length: ${parts[0].length} chars.`);
                jsonPart = parts[1];
            } else {
                console.warn(`[LocalProvider] No CoD separator found, attempting to parse full response.`);
            }

            return jsonPart;
        } catch (error: unknown) {
            // Rethrow DOMException AbortError as our typed AbortError
            if (error instanceof DOMException && error.name === 'AbortError') {
                throw new AbortError('Request aborted', error);
            }
            throw error;
        } finally {
            // Always destroy the cloned session after use
            console.log(`[LocalProvider] [${new Date().toISOString()}] Destroying cloned session`);
            session.destroy();
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
