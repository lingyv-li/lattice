# Product Requirements Document: Lattice Tabs

**Version**: 0.5.0
**Status**: Live / Maintenance
**Date**: 2026-01-04

## 1. Executive Summary
Lattice Tabs is a privacy-first, local-AI driven browser extension designed to mitigate "tab fatigue" and cognitive load for power users. Unlike competitors that rely on cloud-based LLMs (imposing latency and privacy risks), Lattice exploits the emerging edge-AI capabilities of Chrome (Gemini Nano) to organize, group, and manage tabs entirely on-device.

## 2. Product Vision
To create a "self-organizing" browser interface that dynamically adapts to the user's mental context, ensuring that the browser state reflects the user's immediate intent without manual maintenance.

## 3. Core Functional Requirements

### 3.1. Intelligent Tab Grouping
The system must analyze tab metadata (title, URL) and content to clustering semantically related tabs.
-   **Feature: Autopilot Mode**
    -   *Logic*: Background process monitors tab creation/updates. When entropy (disorganization) passes a threshold, the ecosystem is re-evaluated.
    -   *Constraint*: Must run silently without interrupting user typing/interaction.
-   **Feature: Copilot Mode**
    -   *Logic*: On-demand analysis initiated by the user via Side Panel. Presents a "Proposed State" diff for user approval.

### 3.2. AI Inference Engine
-   **Primary (Local)**: Must utilize Chrome's `window.ai` / `LanguageModel` API (Gemini Nano).
    -   *Requirement*: Zero data egress. Work completely offline.
-   **Secondary (Cloud Fallback)**: Support for Gemini Flash/Pro via API Key.
    -   *Use Case*: Complex reasoning or non-English content handling where Nano struggles.

### 3.3. Workspace Hygiene
-   **Feature: Duplicate Detection**
    -   *Logic*: Real-time identification of exact URL matches.
    -   *Action*: Auto-close or prompt user based on settings.

### 3.4. User Interface
-   **Side Panel**: Primary interaction surface. Displays current groups, ungrouped tabs, and AI suggestions.
-   **Settings**: Granular control over "Aggressiveness" of grouping and AI provider selection.

## 4. Non-Functional Requirements (Constraints)
-   **Privacy**: User data must NEVER leave the device in Default (Local) mode.
-   **Performance**: Grouping operations must not freeze the main browser thread. Inference must happen in Service Worker or compatible off-main-thread context.
-   **Compatibility**: Must adhere to Manifest V3 strict security policies (no remote code execution).

## 5. User Flows
1.  **Onboarding**: User installs -> Detects Nano availability -> Downloads model if needed -> Ready.
2.  **Daily Use**: User opens 10+ tabs -> Lattice detects cluster -> "Group these 4 tabs as 'Research'?" -> User clicks "Yes".

## 6. Future Roadmap Opportunities
-   **Tab Stashing/Suspension**: Offloading memory for inactive groups.
-   **Cross-Device Context**: Syncing definitions of groups without syncing full data.
-   **Contextual Search**: RAG over open tabs.
-   **Contextual Group Readmes**: AI-generated summary/sticky-notes for each tab group (e.g., "Comparison of Tokyo hotels").
-   **Natural Language Tab Search**: Semantic search over tab titles using the local model (e.g., query "food" finds "Grandma's Falafel").
