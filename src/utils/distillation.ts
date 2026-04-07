import type { RejectionSnapshot } from '../types/rejection';
import type { AIProvider } from '../services/ai/types';
import { popPendingRejections, getLearnedPreferences, setLearnedPreferences, LEARNED_PREFERENCES_MAX_LENGTH } from './rejectionMemory';

export async function distillRejections(rejections: RejectionSnapshot[], provider: AIProvider, signal: AbortSignal): Promise<string> {
    if (!provider.canSummarize || rejections.length === 0) return '';

    const formatted = rejections
        .map((r, i) => {
            const tabLines = r.tabs.map(t => `   - "${t.title}" (${t.hostname})`).join('\n');
            return `${i + 1}. Group "${r.groupName}":\n${tabLines}`;
        })
        .join('\n\n');

    const prompt = `The user rejected these proposed tab groupings:\n\n${formatted}\n\nEach rejection means the user did NOT want those tabs grouped that way.\nWrite 1-2 short rules (one sentence each) that capture what the user probably prefers.\nRules must generalize beyond these specific tabs.\nOutput only rules, one per line, starting with "- ".\nIf there is no clear pattern, output nothing.`;

    return (await provider.summarize(prompt, signal)).trim();
}

async function compressPreferences(allRules: string, provider: AIProvider, signal: AbortSignal): Promise<string> {
    const prompt = `These are tab grouping preference rules. Compress them to fit within ${LEARNED_PREFERENCES_MAX_LENGTH} characters.\nMerge overlapping rules. Keep the most specific and actionable. Drop vague ones.\nOutput only rules, one per line, starting with "- ".\n\n${allRules}`;
    return (await provider.summarize(prompt, signal)).trim().slice(0, LEARNED_PREFERENCES_MAX_LENGTH);
}

/**
 * Pop pending rejections, distill into rules, update learnedPreferences.
 * No-op when provider cannot summarize or there are no pending rejections.
 */
export async function processDistillation(provider: AIProvider, signal: AbortSignal): Promise<void> {
    if (!provider.canSummarize) return;
    const pending = await popPendingRejections();
    if (pending.length === 0) return;

    const newRules = await distillRejections(pending, provider, signal);
    if (!newRules) return;

    const existing = await getLearnedPreferences();
    const combined = existing ? `${existing}\n${newRules}` : newRules;

    if (combined.length <= LEARNED_PREFERENCES_MAX_LENGTH) {
        await setLearnedPreferences(combined);
    } else {
        await setLearnedPreferences(await compressPreferences(combined, provider, signal));
    }
}
