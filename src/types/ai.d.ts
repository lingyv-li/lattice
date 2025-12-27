export { };

declare global {
    interface LanguageModelFactory {
        capabilities(): Promise<AILanguageModelCapabilities>;
        create(options?: AILanguageModelCreateOptions): Promise<AILanguageModel>;
    }

    // Declare global variable for window.ai.languageModel OR global LanguageModel depending on version
    // Based on user feedback and docs, it seems to be exposed as `LanguageModel` global or `self.ai.languageModel` in recent builds?
    // Docs say: await LanguageModel.availability();
    // So we define it as a var
    var LanguageModel: {
        availability(): Promise<'readily' | 'after-download' | 'no'>;
        create(options?: AILanguageModelCreateOptions): Promise<AILanguageModel>;
        params(): Promise<{ defaultTopK: number; maxTopK: number; defaultTemperature: number; maxTemperature: number }>;
    };

    interface Window {
        ai: {
            languageModel: LanguageModelFactory;
        };
    }

    interface AILanguageModelCapabilities {
        available: 'readily' | 'after-download' | 'no';
        defaultTopK?: number;
        maxTopK?: number;
        defaultTemperature?: number;
    }

    interface AILanguageModelCreateOptions {
        signal?: AbortSignal;
        monitor?: (monitor: AICreateMonitor) => void;
        systemPrompt?: string;
        initialPrompts?: { role: 'system' | 'user' | 'assistant'; content: string }[];
        expectedInputs?: { type: 'text' | 'image' | 'audio'; languages: string[] }[];
        expectedOutputs?: { type: 'text'; languages: string[] }[];
    }

    interface AICreateMonitor extends EventTarget {
        ondownloadprogress: ((this: AICreateMonitor, ev: ProgressEvent) => any) | null;
    }

    interface AILanguageModel {
        prompt(input: string): Promise<string>;
        promptStreaming(input: string): ReadableStream;
        countPromptTokens(input: string): Promise<number>;
        maxTokens: number;
        tokensSoFar: number;
        tokensLeft: number;
        topK: number;
        temperature: number;
        destroy(): void;
        clone(): Promise<AILanguageModel>;
    }
}
