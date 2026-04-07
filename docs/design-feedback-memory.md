# Design: Feedback Memory System

**Status**: Proposal
**Date**: 2026-04-06

## Goal

The system learns from user dismissals to improve future grouping suggestions. When a user dismisses a suggestion, the AI distills the rejection into a short preference rule that generalizes to future tabs. Over time, the system builds a compact set of learned preferences that shape the AI prompt.

## Design Principles

1. **Dismiss = signal.** The act of dismissing is the only required input. No feedback forms or reason codes.
2. **Store what was rejected, not why.** The rejected group name + tab titles/hostnames is the data. The AI infers the pattern.
3. **Distill, don't accumulate.** The AI compresses rejected examples into short generalizable rules. Raw rejection snapshots are transient; learned rules are durable.
4. **Budget is fixed.** Learned preferences have a hard character cap. New learnings compete for space. The memory is self-compacting — the AI re-summarizes when it overflows.
5. **Free-form only.** User-written custom rules and AI-learned rules coexist as plain text. No profiles, no structured settings.

## Data Flow

```
User dismisses suggestion
  → store rejection snapshot in session storage
  → on next processing cycle, AI distills pending rejections into preference rules
  → append rules to learned preferences in local storage
  → compress if over budget
  → inject into AI prompt alongside user's custom rules
```

## Rejection Snapshot

Captured on dismiss. Stored in `chrome.storage.session` (transient — cleared on browser restart). Key: `pendingRejections`. Capped at 20 entries.

```ts
interface RejectionSnapshot {
  groupName: string;
  tabs: { title: string; hostname: string }[];
  timestamp: string; // ISO
}
```

Only tab titles and hostnames are stored — no full URLs. This keeps the data minimal and avoids leaking sensitive URL parameters.

## Distillation

At the start of each `QueueProcessor` cycle, before building the AI prompt:

1. Read and clear `pendingRejections` from session storage.
2. If non-empty, make one AI call with the rejections as context:

```
The user rejected these proposed tab groupings:

1. Group "Research": ["React useEffect cleanup - Stack Overflow", "Fix memory leak - GitHub PR #45", "useEffect reference - React docs"]
2. Group "Shopping": ["AirPods Max - Amazon", "Best noise cancelling headphones 2026 - Reddit"]

Each rejection means the user did NOT want those tabs grouped that way.
Write 1-2 short rules (one sentence each) that capture what the user probably prefers.
Rules should generalize beyond these specific tabs.
Only write rules if there is a clear pattern. If the rejection seems arbitrary, write nothing.
```

3. Append returned rules to `learnedPreferences` in `chrome.storage.local`.

Example output:
- "Separate active code review from reference documentation — don't group PRs with docs/SO."
- "Don't group product pages with discussion forums about those products."

## Memory Budget

**Hard cap: 500 characters** for `learnedPreferences`. This fits roughly 5-8 short rules and keeps prompt overhead minimal.

When appending new rules would exceed the cap, the AI re-summarizes all rules (existing + new) to fit within the budget:

```
Compress these tab grouping preference rules into at most 500 characters.
Merge overlapping rules. Drop the least important if needed.
Keep the most specific, actionable rules.

[all rules]
```

This makes the memory **self-compacting**: early rules fold into broader patterns as more feedback accumulates. The system never grows unbounded, and the most reinforced patterns survive compression.

## Storage

```ts
// chrome.storage.session (transient, cleared on restart)
{
  pendingRejections: RejectionSnapshot[]  // max 20
}

// chrome.storage.local (durable, device-local)
{
  learnedPreferences: string  // max 500 chars, plain text rules
}
```

All feedback data uses local/session storage only — no sync storage, avoiding the 100KB sync quota constraint.

## Prompt Structure

The AI prompt for grouping includes learned preferences after the user's custom rules:

```
[user's custom grouping rules OR defaults]

## Learned from your usage
[learnedPreferences, verbatim]
```

The section is omitted when `learnedPreferences` is empty.

## UI

- Each suggestion card has a dismiss (X) button. Clicking it removes the suggestion and records a rejection snapshot. No follow-up form.
- The `DismissSuggestion` message flows from the sidepanel through the port to the background service worker, which removes the suggestion from the cache and stores the snapshot.
- Learned preferences are shown as read-only text in the settings page, beneath the custom rules textarea, so users can see what the system has learned.

## Cost

- **Per dismiss**: 0 API calls. Session storage write only.
- **Per processing cycle with pending rejections**: 1 extra AI call for distillation. This piggybacks on cycles already making AI calls.
- **Per budget overflow**: 1 extra AI call for compression. Infrequent — only when accumulated rules exceed 500 chars.
- **Typical case**: 0 extra calls (no pending rejections most cycles).

## Local-Only Mode

Distillation requires an AI call. For users on Gemini Nano only, the model may not reliably produce good rule summaries. In this case, the system falls back to storing the last N raw rejection snapshots (group name + tab list) and injecting them directly as negative examples in the prompt, without distillation.
