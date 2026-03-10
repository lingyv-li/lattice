# Feedback Memory System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pending profile/feedback-form implementation with a dismiss-driven memory system that distills rejected suggestions into learned AI preferences.

**Architecture:** Dismissing a suggestion stores a `RejectionSnapshot` in session storage. At the start of each AI processing cycle, the background service worker pops pending rejections and calls the AI (Gemini only) to distill them into short preference rules, stored in local storage under `learnedPreferences` with a 500-char cap. These learned preferences are appended to the effective prompt rules alongside the user's free-form custom rules. For local-only users, pending rejections are injected as raw negative examples instead.

**Tech Stack:** TypeScript, Chrome Extension APIs (storage.session + storage.local), Google GenAI SDK (`@google/genai`), React, Vitest

---

## File Map

**Delete:**
- `src/types/feedback.ts`
- `src/types/profiles.ts`
- `src/utils/feedbackStorage.ts`
- `src/utils/personalization.ts`
- `src/utils/__tests__/feedbackStorage.test.ts`
- `src/utils/__tests__/personalization.test.ts`

**Create:**
- `src/types/rejection.ts` — `RejectionSnapshot` interface
- `src/utils/rejectionMemory.ts` — session/local storage helpers + `getEffectiveRules`
- `src/utils/distillation.ts` — AI distillation + compression logic
- `src/utils/__tests__/rejectionMemory.test.ts`
- `src/utils/__tests__/distillation.test.ts`

**Modify:**
- `src/utils/storage.ts` — remove `personalizationProfiles`, `activePersonalization`, `ActivePersonalization` type
- `src/services/ai/types.ts` — add `canSummarize: boolean` and `summarize()` to `AIProvider`
- `src/services/ai/GeminiProvider.ts` — implement `summarize()`
- `src/services/ai/LocalProvider.ts` — stub `canSummarize = false`
- `src/background/index.ts` — capture `RejectionSnapshot` before removing suggestions
- `src/background/queueProcessor.ts` — call distillation; hoist `getEffectiveRules` outside batch loop; pass `effectiveRules` into `processWindowBatch`
- `src/background/__tests__/queueProcessor.test.ts` — update mocks
- `src/background/__tests__/integration/setup.ts` — remove profile fields from default settings
- `src/sidepanel/components/SuggestionItem.tsx` — remove `FeedbackForm`, `feedbackContext`, `tabIds` props; keep `onDismiss` + X button
- `src/sidepanel/components/SuggestionList.tsx` — remove `feedbackContext` wiring
- `src/sidepanel/components/__tests__/SuggestionItem.test.tsx` — remove feedback tests
- `src/sidepanel/components/__tests__/SuggestionList.test.tsx` — remove feedback mock
- `src/sidepanel/components/__tests__/__snapshots__/SuggestionItem.test.tsx.snap` — delete (regenerate)
- `src/sidepanel/components/__tests__/__snapshots__/SuggestionList.test.tsx.snap` — delete (regenerate)
- `src/options/index.tsx` — remove profile editor; add read-only learned preferences section

---

## Task 1: Strip profile and feedback cruft

**Files:**
- Delete: `src/types/feedback.ts`, `src/types/profiles.ts`, `src/utils/feedbackStorage.ts`, `src/utils/personalization.ts`
- Delete: `src/utils/__tests__/feedbackStorage.test.ts`, `src/utils/__tests__/personalization.test.ts`
- Modify: `src/utils/storage.ts`
- Modify: `src/sidepanel/components/SuggestionItem.tsx`
- Modify: `src/sidepanel/components/SuggestionList.tsx`
- Modify: `src/options/index.tsx`
- Delete: `src/sidepanel/components/__tests__/__snapshots__/SuggestionItem.test.tsx.snap`
- Delete: `src/sidepanel/components/__tests__/__snapshots__/SuggestionList.test.tsx.snap`

- [ ] **Step 1: Delete unused files**

```bash
rm src/types/feedback.ts src/types/profiles.ts
rm src/utils/feedbackStorage.ts src/utils/personalization.ts
rm src/utils/__tests__/feedbackStorage.test.ts src/utils/__tests__/personalization.test.ts
rm src/sidepanel/components/__tests__/__snapshots__/SuggestionItem.test.tsx.snap
rm src/sidepanel/components/__tests__/__snapshots__/SuggestionList.test.tsx.snap
```

- [ ] **Step 2: Clean `src/utils/storage.ts`**

Remove the `PersonalizationProfile` import, `ActivePersonalization` type, and the two fields from `SyncedSettings` and `DEFAULT_SYNCED_SETTINGS`.

Replace the top of the file so it reads:

```ts
import { FeatureId } from '../types/features';

export enum AIProviderType {
    Local = 'local',
    Gemini = 'gemini',
    None = 'none'
}

export interface FeatureSettings {
    enabled: boolean;
    autopilot: boolean;
}

export interface SyncedSettings {
    customGroupingRules: string;
    geminiApiKey: string;
    hasCompletedOnboarding: boolean;
    features: Record<FeatureId, FeatureSettings>;
}
```

And `DEFAULT_SYNCED_SETTINGS`:
```ts
export const DEFAULT_SYNCED_SETTINGS: SyncedSettings = {
    customGroupingRules: '',
    geminiApiKey: '',
    hasCompletedOnboarding: false,
    features: {
        [FeatureId.TabGrouper]: { enabled: false, autopilot: false },
        [FeatureId.DuplicateCleaner]: { enabled: true, autopilot: false }
    }
};
```

- [ ] **Step 3: Simplify `src/sidepanel/components/SuggestionItem.tsx`**

Replace the entire file with the version below — removes `FeedbackForm`, `feedbackContext`, `tabIds`, but keeps `onDismiss` and the X button:

```tsx
import React from 'react';
import { LucideIcon, ArrowRight, Loader2, X } from 'lucide-react';
import { SuggestionType, SuggestionTab } from '../../types/suggestions';

interface SuggestionItemProps {
    title: string;
    description: string;
    icon: LucideIcon;
    type: SuggestionType;
    onClick: () => void;
    onDismiss?: () => void;
    isLoading?: boolean;
    disabled?: boolean;
    tabs?: SuggestionTab[];
}

export const SuggestionItem: React.FC<SuggestionItemProps> = ({
    title,
    description,
    icon: Icon,
    type,
    onClick,
    onDismiss,
    isLoading,
    disabled,
    tabs
}) => {
    const canReject = !!onDismiss && type === SuggestionType.Group;

    const groupedTabs = React.useMemo(() => {
        if (!tabs) return [];
        const groups = new Map<string, { count: number; tab: (typeof tabs)[0] }>();
        tabs.forEach(tab => {
            const key = `${tab.title || ''}|${tab.favIconUrl || ''}`;
            const existing = groups.get(key);
            if (existing) existing.count++;
            else groups.set(key, { count: 1, tab });
        });
        return Array.from(groups.values());
    }, [tabs]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!disabled && !isLoading) onClick();
        }
    };

    return (
        <div
            role='button'
            tabIndex={disabled || isLoading ? -1 : 0}
            className={`
            suggestion-item-card w-full group relative overflow-hidden cursor-pointer
            bg-surface border rounded-lg transition-all duration-200 border-border-subtle
            ${disabled ? 'opacity-50 pointer-events-none' : '[&:hover:not(:has(.reject-btn:hover))]:border-action [&:hover:not(:has(.reject-btn:hover))]:bg-surface-highlight'}
        `}
            onClick={onClick}
            onKeyDown={handleKeyDown}
            aria-label={`${title}: ${description}. Apply suggestion.`}
        >
            <div className='flex items-center gap-2 p-2'>
                <div className='flex flex-1 min-w-0 items-center gap-2'>
                    <div className={`p-1.5 rounded-md shrink-0 ${type === SuggestionType.Group ? 'bg-indigo-500/10 text-indigo-500' : 'bg-rose-500/10 text-rose-500'}`}>
                        {isLoading ? <Loader2 className='w-4 h-4 animate-spin' /> : <Icon className='w-4 h-4' />}
                    </div>
                    <div className='flex-1 min-w-0'>
                        <h3 className='font-medium text-main truncate text-sm leading-tight'>{title}</h3>
                        <p className='text-[10px] text-muted truncate leading-tight'>{description}</p>
                    </div>
                    <div
                        className={`
                        apply-pill flex items-center gap-1.5 px-2 py-1 rounded-full
                        text-muted group-hover:text-action group-hover:bg-action/10
                        transition-opacity duration-300
                        group-has-[.reject-btn:hover]:opacity-0
                        ${isLoading ? 'opacity-0' : ''}
                    `}
                    >
                        <span className='text-[10px] font-semibold uppercase tracking-wide opacity-0 w-0 group-hover:w-auto group-hover:opacity-100 transition-all duration-200 overflow-hidden whitespace-nowrap'>
                            Apply
                        </span>
                        {!isLoading && <ArrowRight className='w-3.5 h-3.5' />}
                    </div>
                </div>
                {canReject && (
                    <button
                        type='button'
                        className='reject-btn p-1.5 rounded-lg text-muted cursor-pointer hover:text-action hover:bg-surface-highlight shrink-0 transition-colors duration-200'
                        onClick={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDismiss();
                        }}
                        aria-label='Reject suggestion'
                    >
                        <X className='w-4 h-4' />
                    </button>
                )}
            </div>
            {groupedTabs.length > 0 && (
                <div className='px-2 pb-2 pl-9 space-y-0.5'>
                    {groupedTabs.map(({ tab, count }, idx) => (
                        <div key={idx} className='flex items-center gap-1.5 min-w-0'>
                            {tab.favIconUrl ? (
                                <img src={tab.favIconUrl} className='w-3 h-3 shrink-0 rounded-sm' alt='' />
                            ) : (
                                <div className='w-3 h-3 shrink-0 rounded-sm bg-border-subtle' />
                            )}
                            <span className='text-[10px] text-muted truncate leading-tight flex-1'>{tab.title || tab.url}</span>
                            {count > 1 && <span className='text-[10px] text-muted shrink-0 font-medium'>x{count}</span>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
```

- [ ] **Step 4: Simplify `src/sidepanel/components/SuggestionList.tsx`**

Remove `feedbackContext` and `tabIds` wiring. The `onDismiss` prop is still passed (it calls `dismissSuggestion`). Replace the `SuggestionItem` call block and remove the unused `FeedbackContext` import:

```tsx
import React, { useMemo } from 'react';
import { Group, Trash2, Sparkles, Loader2, LucideIcon } from 'lucide-react';
import { useTabGrouper } from '../../hooks/useTabGrouper';
import { useDuplicateCleaner } from '../../hooks/useDuplicateCleaner';
import { SuggestionItem } from './SuggestionItem';
import { SuggestionType } from '../../types/suggestions';
import { groupSuggestionKey } from '../../utils/groupSuggestionKey';
```

(Remove `type { FeedbackContext }` import from SuggestionItem and the `getDomainsFromTabs` helper.)

In the `UnifiedSuggestion` interface, remove `groupName?`, `tabIds?`, `feedbackContext?`.

In the render:
```tsx
<SuggestionItem
    key={item.id}
    title={item.title}
    description={item.description}
    icon={item.icon}
    type={item.type}
    onClick={() => handleAction(item.id, item.onClick)}
    onDismiss={item.tabIds?.length ? () => dismissSuggestion(item.tabIds!) : undefined}
    isLoading={processingId === item.id}
    disabled={(processingId !== null && processingId !== item.id) || isAcceptingAll}
    tabs={item.tabs.map(t => ({ title: t.title, url: t.url, favIconUrl: t.favIconUrl }))}
/>
```

Keep `tabIds` on `UnifiedSuggestion` only for the `onDismiss` closure — remove `feedbackContext` and `groupName`.

- [ ] **Step 5: Strip profile editor from `src/options/index.tsx`**

Remove these imports: `User, Plus, Pencil, Trash2` from lucide-react and `type { PersonalizationProfile, GranularityPreference }` from profiles.

Remove these state declarations:
```ts
const [editingProfile, setEditingProfile] = useState<PersonalizationProfile | null>(null);
const profiles = settings.personalizationProfiles ?? [];
const activePersonalization = settings.activePersonalization ?? 'freeform';
```

Remove `handleAddProfile`, `handleEditProfile`, `handleSaveProfile`, `handleDeleteProfile` functions.

Replace the entire "Personalization" section (the `<div className='space-y-4'>` that contains the tab switcher and profile editor) with the original "Grouping Rules" section:

```tsx
<div className='space-y-4'>
    <h2 className='text-xs font-bold uppercase tracking-wider text-muted pl-1'>Grouping Rules</h2>

    <div className='p-4 bg-surface-dim rounded-2xl border border-border-subtle group hover:border-teal-500/30 transition-colors focus-within:border-teal-500/50'>
        <label className='block font-medium text-main mb-2'>Custom AI Instructions</label>
        <p className='text-sm text-muted mb-3'>
            Add specific rules for the AI to follow when grouping tabs (e.g., &quot;Group all Jira tickets together&quot;).
        </p>
        <textarea
            value={settings.customGroupingRules}
            onChange={e => setSettings(s => ({ ...s, customGroupingRules: e.target.value }))}
            placeholder={DEFAULT_GROUPING_RULES}
            className='w-full h-32 bg-surface/50 rounded-xl border border-border-subtle p-3 text-sm text-main placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all resize-none'
        />
    </div>
</div>
```

- [ ] **Step 6: Run tests and fix any type errors**

```bash
npm run test 2>&1 | head -60
npm run build 2>&1 | tail -30
```

Expected: type errors about missing `personalizationProfiles`/`activePersonalization` in test setup and queueProcessor mock. Fix them in the next step.

- [ ] **Step 7: Fix `src/background/__tests__/integration/setup.ts`**

Find the `initializeSettings` call (around line 367) and remove the two profile fields:

```ts
await SettingsStorage.set({
    customGroupingRules: '',
    geminiApiKey: '',
    hasCompletedOnboarding: true,
    aiModel: ''
});
```

- [ ] **Step 8: Fix `src/background/__tests__/queueProcessor.test.ts`**

Remove the `vi.mock('../../utils/personalization', ...)` block entirely (3 lines).

- [ ] **Step 9: Update `src/sidepanel/components/__tests__/SuggestionItem.test.tsx`**

Remove `vi.mock('../../../utils/feedbackStorage', ...)`.

Remove the entire `describe('feedback / Skip independence', ...)` block.

- [ ] **Step 10: Update `src/sidepanel/components/__tests__/SuggestionList.test.tsx`**

Remove `vi.mock('../../../utils/feedbackStorage', ...)`.

Remove all `dismissSuggestion: mockDismissSuggestion` entries from the mock return values (3 places).

Also remove `const mockDismissSuggestion = vi.fn();`.

- [ ] **Step 11: Verify tests pass**

```bash
npm run test 2>&1 | tail -20
```

Expected: all tests pass, snapshots regenerate.

- [ ] **Step 12: Commit**

```bash
jj commit -m "chore: strip profile and feedback-form system

Remove personalization profiles, feedback reason codes, and the
feedback form UI. The dismiss button remains; memory will be rebuilt
from rejection snapshots in the next commits."
```

---

## Task 2: Add rejection memory types and storage helpers

**Files:**
- Create: `src/types/rejection.ts`
- Create: `src/utils/rejectionMemory.ts`
- Create: `src/utils/__tests__/rejectionMemory.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/__tests__/rejectionMemory.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { storePendingRejection, popPendingRejections, getLearnedPreferences, setLearnedPreferences, clearLearnedPreferences, getEffectiveRules } from '../rejectionMemory';
import type { RejectionSnapshot } from '../../types/rejection';
import { DEFAULT_GROUPING_RULES } from '../storage';
import type { AppSettings } from '../storage';

const mockSessionGet = vi.fn();
const mockSessionSet = vi.fn();
const mockSessionRemove = vi.fn();
const mockLocalGet = vi.fn();
const mockLocalSet = vi.fn();
const mockLocalRemove = vi.fn();

beforeEach(() => {
    vi.clearAllMocks();
    mockSessionGet.mockResolvedValue({});
    mockSessionSet.mockResolvedValue(undefined);
    mockSessionRemove.mockResolvedValue(undefined);
    mockLocalGet.mockResolvedValue({});
    mockLocalSet.mockResolvedValue(undefined);
    mockLocalRemove.mockResolvedValue(undefined);
    const g = global as unknown as { chrome: unknown };
    g.chrome = {
        storage: {
            session: { get: mockSessionGet, set: mockSessionSet, remove: mockSessionRemove },
            local: { get: mockLocalGet, set: mockLocalSet, remove: mockLocalRemove }
        }
    };
});

const snap: RejectionSnapshot = {
    groupName: 'Work',
    tabs: [{ title: 'PR #1', hostname: 'github.com' }],
    timestamp: '2026-01-01T00:00:00.000Z'
};

describe('storePendingRejection', () => {
    it('appends to empty list', async () => {
        mockSessionGet.mockResolvedValue({ pendingRejections: [] });
        await storePendingRejection(snap);
        expect(mockSessionSet).toHaveBeenCalledWith({ pendingRejections: [snap] });
    });

    it('prunes to max 20', async () => {
        const existing = Array.from({ length: 20 }, (_, i) => ({ ...snap, groupName: `G${i}` }));
        mockSessionGet.mockResolvedValue({ pendingRejections: existing });
        await storePendingRejection(snap);
        const saved = mockSessionSet.mock.calls[0][0].pendingRejections as RejectionSnapshot[];
        expect(saved.length).toBe(20);
        expect(saved[saved.length - 1]?.groupName).toBe('Work');
    });
});

describe('popPendingRejections', () => {
    it('returns list and removes from storage', async () => {
        mockSessionGet.mockResolvedValue({ pendingRejections: [snap] });
        const result = await popPendingRejections();
        expect(result).toEqual([snap]);
        expect(mockSessionRemove).toHaveBeenCalledWith('pendingRejections');
    });

    it('returns empty array when nothing stored', async () => {
        const result = await popPendingRejections();
        expect(result).toEqual([]);
        expect(mockSessionRemove).not.toHaveBeenCalled();
    });
});

describe('getLearnedPreferences / setLearnedPreferences / clearLearnedPreferences', () => {
    it('returns empty string by default', async () => {
        expect(await getLearnedPreferences()).toBe('');
    });

    it('round-trips through set/get', async () => {
        mockLocalGet.mockResolvedValue({ learnedPreferences: '- Keep code separate from docs.' });
        expect(await getLearnedPreferences()).toBe('- Keep code separate from docs.');
    });

    it('clearLearnedPreferences removes the key', async () => {
        await clearLearnedPreferences();
        expect(mockLocalRemove).toHaveBeenCalledWith('learnedPreferences');
    });
});

describe('getEffectiveRules', () => {
    it('returns default rules when customGroupingRules is empty and no learned prefs', async () => {
        const settings = { customGroupingRules: '' } as AppSettings;
        expect(await getEffectiveRules(settings)).toBe(DEFAULT_GROUPING_RULES);
    });

    it('returns custom rules when set', async () => {
        const settings = { customGroupingRules: 'My rules.' } as AppSettings;
        expect(await getEffectiveRules(settings)).toBe('My rules.');
    });

    it('appends learned preferences when present', async () => {
        mockLocalGet.mockResolvedValue({ learnedPreferences: '- No mixing docs with PRs.' });
        const settings = { customGroupingRules: 'My rules.' } as AppSettings;
        const result = await getEffectiveRules(settings);
        expect(result).toContain('My rules.');
        expect(result).toContain('## Learned from your usage');
        expect(result).toContain('- No mixing docs with PRs.');
    });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm run test src/utils/__tests__/rejectionMemory.test.ts 2>&1 | tail -10
```

Expected: `Cannot find module '../rejectionMemory'`

- [ ] **Step 3: Create `src/types/rejection.ts`**

```ts
export interface RejectionSnapshot {
    /** Group name the AI proposed */
    groupName: string;
    /** Tab titles + hostnames only — no full URLs */
    tabs: { title: string; hostname: string }[];
    /** ISO timestamp */
    timestamp: string;
}
```

- [ ] **Step 4: Create `src/utils/rejectionMemory.ts`**

```ts
import type { RejectionSnapshot } from '../types/rejection';
import type { AppSettings } from './storage';
import { DEFAULT_GROUPING_RULES } from './storage';

const PENDING_REJECTIONS_KEY = 'pendingRejections';
const LEARNED_PREFERENCES_KEY = 'learnedPreferences';
const MAX_PENDING = 20;
export const LEARNED_PREFERENCES_MAX_LENGTH = 500;

export async function storePendingRejection(snapshot: RejectionSnapshot): Promise<void> {
    const result = await chrome.storage.session.get(PENDING_REJECTIONS_KEY);
    const list: RejectionSnapshot[] = Array.isArray(result[PENDING_REJECTIONS_KEY]) ? result[PENDING_REJECTIONS_KEY] : [];
    list.push(snapshot);
    await chrome.storage.session.set({ [PENDING_REJECTIONS_KEY]: list.slice(-MAX_PENDING) });
}

export async function popPendingRejections(): Promise<RejectionSnapshot[]> {
    const result = await chrome.storage.session.get(PENDING_REJECTIONS_KEY);
    const list: RejectionSnapshot[] = Array.isArray(result[PENDING_REJECTIONS_KEY]) ? result[PENDING_REJECTIONS_KEY] : [];
    if (list.length > 0) {
        await chrome.storage.session.remove(PENDING_REJECTIONS_KEY);
    }
    return list;
}

export async function getLearnedPreferences(): Promise<string> {
    const result = await chrome.storage.local.get(LEARNED_PREFERENCES_KEY);
    const raw = result[LEARNED_PREFERENCES_KEY];
    return typeof raw === 'string' ? raw : '';
}

export async function setLearnedPreferences(prefs: string): Promise<void> {
    await chrome.storage.local.set({ [LEARNED_PREFERENCES_KEY]: prefs });
}

export async function clearLearnedPreferences(): Promise<void> {
    await chrome.storage.local.remove(LEARNED_PREFERENCES_KEY);
}

export async function getEffectiveRules(settings: AppSettings): Promise<string> {
    const baseRules = settings.customGroupingRules?.trim() || DEFAULT_GROUPING_RULES;
    const learned = await getLearnedPreferences();
    if (learned.trim()) {
        return `${baseRules}\n\n## Learned from your usage\n${learned.trim()}`;
    }
    return baseRules;
}
```

- [ ] **Step 5: Run tests — expect pass**

```bash
npm run test src/utils/__tests__/rejectionMemory.test.ts 2>&1 | tail -10
```

Expected: all 8 tests pass.

- [ ] **Step 6: Commit**

```bash
jj commit -m "feat: add rejection memory storage

RejectionSnapshot type + helpers to store pending rejections in session
storage and learned preferences in local storage, with getEffectiveRules
replacing the old personalization.ts."
```

---

## Task 3: Add `summarize` capability to AI providers

**Files:**
- Modify: `src/services/ai/types.ts`
- Modify: `src/services/ai/GeminiProvider.ts`
- Modify: `src/services/ai/LocalProvider.ts`

- [ ] **Step 1: Extend `AIProvider` interface in `src/services/ai/types.ts`**

Add two members after `id`:

```ts
export interface AIProvider {
    id: string;

    /**
     * Whether this provider can summarize free-form text.
     * LocalProvider returns false — Gemini Nano is not reliable for summarization.
     */
    canSummarize: boolean;

    /**
     * Free-form text summarization. Only call when canSummarize is true.
     * Used for distilling rejection snapshots into preference rules.
     */
    summarize(prompt: string, signal: AbortSignal): Promise<string>;

    generateSuggestions(request: GroupingRequest): Promise<SuggestionResult>;
}
```

- [ ] **Step 2: Implement `summarize` in `src/services/ai/GeminiProvider.ts`**

Add after `id = 'gemini';`:

```ts
canSummarize = true;

async summarize(prompt: string, signal: AbortSignal): Promise<string> {
    return this.promptAI(prompt, 'You are a concise assistant helping refine AI tab-grouping rules.', signal);
}
```

- [ ] **Step 3: Implement stub in `src/services/ai/LocalProvider.ts`**

Add after `id = 'local';`:

```ts
canSummarize = false;

async summarize(_prompt: string, _signal: AbortSignal): Promise<string> {
    return '';
}
```

- [ ] **Step 4: Type-check**

```bash
npm run build 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
jj commit -m "feat: add summarize capability to AI providers

GeminiProvider implements free-form summarization via promptAI.
LocalProvider stubs it out (canSummarize = false) since Nano is
not reliable for distillation."
```

---

## Task 4: Add distillation service

**Files:**
- Create: `src/utils/distillation.ts`
- Create: `src/utils/__tests__/distillation.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/utils/__tests__/distillation.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { distillRejections, processDistillation } from '../distillation';
import type { RejectionSnapshot } from '../../types/rejection';
import type { AIProvider } from '../../services/ai/types';

vi.mock('../rejectionMemory', () => ({
    popPendingRejections: vi.fn(),
    getLearnedPreferences: vi.fn().mockResolvedValue(''),
    setLearnedPreferences: vi.fn(),
    LEARNED_PREFERENCES_MAX_LENGTH: 500
}));

import { popPendingRejections, getLearnedPreferences, setLearnedPreferences } from '../rejectionMemory';

const makeProvider = (canSummarize: boolean, response = ''): AIProvider => ({
    id: 'test',
    canSummarize,
    summarize: vi.fn().mockResolvedValue(response),
    generateSuggestions: vi.fn() as AIProvider['generateSuggestions']
});

const snap: RejectionSnapshot = {
    groupName: 'Work',
    tabs: [
        { title: 'PR #45', hostname: 'github.com' },
        { title: 'useEffect docs', hostname: 'react.dev' }
    ],
    timestamp: '2026-01-01T00:00:00.000Z'
};

const signal = new AbortController().signal;

describe('distillRejections', () => {
    it('returns empty string for local provider', async () => {
        const provider = makeProvider(false);
        expect(await distillRejections([snap], provider, signal)).toBe('');
    });

    it('returns empty string for empty rejections', async () => {
        const provider = makeProvider(true, '- Some rule.');
        expect(await distillRejections([], provider, signal)).toBe('');
    });

    it('calls summarize with formatted prompt and returns trimmed result', async () => {
        const provider = makeProvider(true, '  - Keep PRs separate from docs.  ');
        const result = await distillRejections([snap], provider, signal);
        expect(result).toBe('- Keep PRs separate from docs.');
        expect(provider.summarize).toHaveBeenCalledWith(expect.stringContaining('Group "Work"'), signal);
        expect(provider.summarize).toHaveBeenCalledWith(expect.stringContaining('github.com'), signal);
    });
});

describe('processDistillation', () => {
    beforeEach(() => {
        vi.mocked(popPendingRejections).mockResolvedValue([snap]);
        vi.mocked(getLearnedPreferences).mockResolvedValue('');
        vi.mocked(setLearnedPreferences).mockResolvedValue(undefined);
    });

    it('does nothing when no pending rejections', async () => {
        vi.mocked(popPendingRejections).mockResolvedValue([]);
        const provider = makeProvider(true, '- A rule.');
        await processDistillation(provider, signal);
        expect(setLearnedPreferences).not.toHaveBeenCalled();
    });

    it('does nothing when provider cannot summarize', async () => {
        const provider = makeProvider(false);
        await processDistillation(provider, signal);
        expect(setLearnedPreferences).not.toHaveBeenCalled();
    });

    it('stores new rules when under budget', async () => {
        const provider = makeProvider(true, '- Keep PRs separate from docs.');
        await processDistillation(provider, signal);
        expect(setLearnedPreferences).toHaveBeenCalledWith('- Keep PRs separate from docs.');
    });

    it('appends to existing preferences when combined is under budget', async () => {
        vi.mocked(getLearnedPreferences).mockResolvedValue('- Existing rule.');
        const provider = makeProvider(true, '- New rule.');
        await processDistillation(provider, signal);
        expect(setLearnedPreferences).toHaveBeenCalledWith('- Existing rule.\n- New rule.');
    });

    it('compresses when combined exceeds budget', async () => {
        const longExisting = '- ' + 'x'.repeat(490);
        vi.mocked(getLearnedPreferences).mockResolvedValue(longExisting);
        const provider = makeProvider(true, '- New rule.');
        (provider.summarize as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce('- New rule.')      // distill call
            .mockResolvedValueOnce('- Compressed.');   // compress call
        await processDistillation(provider, signal);
        expect(provider.summarize).toHaveBeenCalledTimes(2);
        expect(setLearnedPreferences).toHaveBeenCalledWith('- Compressed.');
    });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm run test src/utils/__tests__/distillation.test.ts 2>&1 | tail -10
```

Expected: `Cannot find module '../distillation'`

- [ ] **Step 3: Create `src/utils/distillation.ts`**

```ts
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
    const pending = await popPendingRejections();
    if (pending.length === 0 || !provider.canSummarize) return;

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
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm run test src/utils/__tests__/distillation.test.ts 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
jj commit -m "feat: add distillation service

distillRejections() converts rejection snapshots to preference rules
via the AI. processDistillation() orchestrates pop → distill → compress
→ persist, with a 500-char self-compacting budget."
```

---

## Task 5: Capture rejection snapshots in the background handler

**Files:**
- Modify: `src/background/index.ts`

- [ ] **Step 1: Update the `DismissSuggestion` handler**

In `src/background/index.ts`, add the import at the top:

```ts
import { storePendingRejection } from '../utils/rejectionMemory';
```

Replace the existing `DismissSuggestion` handler block:

```ts
} else if (msg.type === TabGroupMessageType.DismissSuggestion) {
    if (msg.windowId && msg.tabIds?.length) {
        await StateService.removeSuggestionsForTabIds(msg.windowId, msg.tabIds);
    }
}
```

With:

```ts
} else if (msg.type === TabGroupMessageType.DismissSuggestion) {
    if (msg.windowId && msg.tabIds?.length) {
        // Capture rejection snapshot before removing from cache
        const cacheSamples = await Promise.all(msg.tabIds.map(tid => StateService.getSuggestion(tid, msg.windowId)));
        const groupName = cacheSamples.find(s => s?.groupName)?.groupName;
        if (groupName) {
            const chromeTabs = await Promise.all(msg.tabIds.map(tid => chrome.tabs.get(tid).catch(() => null)));
            const tabs = chromeTabs
                .filter((t): t is chrome.tabs.Tab => t !== null)
                .flatMap(t => {
                    if (!t.url) return [];
                    try {
                        return [{ title: t.title ?? '', hostname: new URL(t.url).hostname }];
                    } catch {
                        return [];
                    }
                })
                .filter(t => t.hostname);
            if (tabs.length > 0) {
                await storePendingRejection({ groupName, tabs, timestamp: new Date().toISOString() });
            }
        }
        await StateService.removeSuggestionsForTabIds(msg.windowId, msg.tabIds);
    }
}
```

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
jj commit -m "feat: capture rejection snapshots on dismiss

Before removing a dismissed suggestion from cache, look up the group
name and tab hostnames/titles and store a RejectionSnapshot in session
storage for distillation on the next processing cycle."
```

---

## Task 6: Integrate distillation into QueueProcessor

**Files:**
- Modify: `src/background/queueProcessor.ts`
- Modify: `src/background/__tests__/queueProcessor.test.ts`

- [ ] **Step 1: Update imports in `src/background/queueProcessor.ts`**

Replace:
```ts
import { getEffectiveRules } from '../utils/personalization';
```

With:
```ts
import { getEffectiveRules } from '../utils/rejectionMemory';
import { processDistillation } from '../utils/distillation';
```

- [ ] **Step 2: Hoist `getEffectiveRules` + add distillation call**

In `QueueProcessor.process()`, after `const settings = await SettingsStorage.get();` and before `const windowIds = this.state.acquireQueue();`, add:

```ts
// Distill any pending rejections into learned preferences
try {
    const provider = await AIService.getProvider(settings);
    const distillSignal = new AbortController().signal;
    await processDistillation(provider, distillSignal);
} catch {
    // Don't let distillation failure block grouping
}

// Resolve effective rules once per cycle (not per batch)
const effectiveRules = await getEffectiveRules(settings);
```

- [ ] **Step 3: Pass `effectiveRules` into `processWindowBatch`**

Change the call site inside the `for batchTabs of batches` loop:
```ts
const result = await this.processWindowBatch(windowId, batchTabs, groupIdManager, settings, effectiveRules);
```

Update the method signature:
```ts
private async processWindowBatch(
    windowId: number,
    batchTabs: chrome.tabs.Tab[],
    groupIdManager: GroupIdManager,
    settings: AppSettings,
    effectiveRules: string
): Promise<{ aborted: boolean }>
```

Inside `processWindowBatch`, remove:
```ts
const effectiveRules = await getEffectiveRules(settings);
```

The `effectiveRules` parameter is now used directly.

- [ ] **Step 4: Update queueProcessor mock**

In `src/background/__tests__/queueProcessor.test.ts`, add a mock for `distillation`:

```ts
vi.mock('../../utils/distillation', () => ({
    processDistillation: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('../../utils/rejectionMemory', () => ({
    getEffectiveRules: vi.fn((s: AppSettings) => Promise.resolve(s.customGroupingRules ?? ''))
}));
```

- [ ] **Step 5: Run full test suite**

```bash
npm run test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
jj commit -m "feat: integrate distillation into QueueProcessor

processDistillation() runs once per cycle before grouping begins.
getEffectiveRules() is now resolved once per cycle and passed into
processWindowBatch, fixing the per-batch storage reads."
```

---

## Task 7: Show learned preferences in options page

**Files:**
- Modify: `src/options/index.tsx`

- [ ] **Step 1: Add learned preferences state and clear handler**

In `src/options/index.tsx`, add imports:

```ts
import { getLearnedPreferences, clearLearnedPreferences } from '../utils/rejectionMemory';
```

Add state after existing state declarations:

```ts
const [learnedPreferences, setLearnedPreferences] = useState('');

useEffect(() => {
    getLearnedPreferences().then(setLearnedPreferences);
}, []);
```

Add handler:
```ts
const handleClearLearnedPreferences = async () => {
    await clearLearnedPreferences();
    setLearnedPreferences('');
};
```

- [ ] **Step 2: Add read-only learned preferences section in the UI**

After the custom AI instructions textarea block, add:

```tsx
{learnedPreferences.trim() && (
    <div className='p-4 bg-surface-dim rounded-2xl border border-border-subtle'>
        <div className='flex items-center justify-between mb-2'>
            <label className='block font-medium text-main'>What the AI has learned</label>
            <button
                type='button'
                onClick={handleClearLearnedPreferences}
                className='text-xs text-muted hover:text-status-error-fg transition-colors'
            >
                Clear
            </button>
        </div>
        <p className='text-sm text-muted mb-3'>Automatically refined from dismissed suggestions.</p>
        <pre className='text-xs text-muted whitespace-pre-wrap font-mono bg-surface/50 rounded-xl border border-border-subtle p-3'>{learnedPreferences}</pre>
    </div>
)}
```

- [ ] **Step 3: Build and verify**

```bash
npm run build 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
jj commit -m "feat: show learned preferences in settings

Read-only section displays what the AI has learned from dismissed
suggestions, with a Clear button to reset."
```

---

## Task 8: Fix remaining code review issues

**Files:**
- Modify: `src/types/toast.ts` — already fixed (`duration: number`)
- Modify: `src/sidepanel/index.css` — already has the `.suggestion-item-card` CSS
- Verify `src/utils/groupSuggestionKey.ts` — already extracted
- Run full build + tests

- [ ] **Step 1: Verify groupSuggestionKey test still passes**

```bash
npm run test src/utils/__tests__/groupSuggestionKey.test.ts 2>&1 | tail -5
```

Expected: 2 tests pass.

- [ ] **Step 2: Full build and test**

```bash
npm run build && npm run test 2>&1 | tail -20
```

Expected: build succeeds, all tests pass.

- [ ] **Step 3: Commit**

```bash
jj commit -m "fix: finalize review cleanup

Verified toast duration type fix, CSS suggestion-item-card tokens,
and groupSuggestionKey extraction all carry forward cleanly."
```
