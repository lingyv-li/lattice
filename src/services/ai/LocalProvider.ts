import { BaseProvider } from './BaseProvider';
import { constructCoTSystemPrompt } from './shared';

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
        return constructCoTSystemPrompt(customRules);
    }

    private async getSession(systemPrompt: string, signal?: AbortSignal): Promise<LanguageModel> {
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

        console.log(`[LocalProvider] [${new Date().toISOString()}] Creating new base session`);
        const sessionCreateStart = Date.now();
        LocalProvider.cachedSession = await LanguageModel.create({
            expectedInputs: [{ type: 'text', languages: ['en'] }],
            initialPrompts: [{
                role: "system",
                content: systemPrompt + `

For each tab, very briefly list the keywords and area up to 5 to 10 per tab. Then produce the final quoted group names following user's instructions. Do NOT repeat the input.

Then assign tabs to groups by outputting the result as ONLY a valid JSON object PRECEDED by the marker "@@JSON_START@@".

EXAMPLE FORMAT:
Tabs:
- 123: Keyword 1, Keyword 2, Keyword 3
- 456: Keyword 4, Keyword 5, Keyword 6

Groups: "Group Name 1", "Group Name 2"

@@JSON_START@@
{ "Group Name 1": [123, 456], "Group Name 2": [789] }`
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
        signal?: AbortSignal
    ): Promise<string> {
        if (await LocalProvider.checkAvailability() !== 'available') {
            throw new Error("Local AI is not available.");
        }

        // Clone the session for this specific request
        // This is lightweight and isolates context
        const session = await this.getSession(systemPrompt, signal);

        const startTime = Date.now();
        console.log(`[LocalProvider] [${new Date().toISOString()}] Sending single-turn CoT prompt`);
        try {

            const response = await session.prompt(userPrompt, { signal });

            const totalDuration = Date.now() - startTime;
            console.log(`[LocalProvider] CoT complete (took ${totalDuration}ms). Parsing response...`);

            const parts = response.split('@@JSON_START@@');
            let jsonPart = response;
            if (parts.length > 1) {
                console.log(`[LocalProvider] Found JSON marker. Reasoning length: ${parts[0].length} chars.`);
                jsonPart = parts[1];
            } else {
                console.warn(`[LocalProvider] No JSON marker found, attempting to parse full response.`);
            }

            return jsonPart;
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
