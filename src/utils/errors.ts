
export const getUserFriendlyError = (error: unknown): string => {
    if (!error) return "An unknown error occurred";

    const message = error instanceof Error ? error.message : String(error);

    // More actionable error messages
    if (message === "AI Provider is disabled.") {
        return "Configure an AI provider in Settings to enable tab grouping";
    }

    // Gemini API errors
    if (message.includes("API key")) {
        return "Invalid Gemini API key. Check your API key in Settings.";
    }

    if (message.includes("quota") || message.includes("429") || message.includes("Quota exceeded")) {
        return "Gemini API quota exceeded. Try again later or use Local AI.";
    }

    // Local AI errors
    if (message.includes("not available") || message.includes("not supported")) {
        return "Local AI is not available in this browser. Try using Gemini instead.";
    }

    // Default to original message
    return message;
};
