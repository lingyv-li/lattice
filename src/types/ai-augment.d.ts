import type { AILanguageModelFactory } from 'dom-chromium-ai';

declare global {
    interface Window {
        LanguageModel: AILanguageModelFactory;
    }
    interface WorkerGlobalScope {
        LanguageModel: AILanguageModelFactory;
    }
}

export { }; // Make this a module
