---
description: How to safely work with jj workspaces
---

# Parallel Working with `jj` Workspaces

Follow this guide to safely work on tasks without conflicting with the main working copy.

> [!CRITICAL]
> **ABSOLUTE RULE: THE MAIN WORKING COPY IS READ-ONLY.**
> You have NO permission to edit files in the root directory.

## Step 1: Verify Context
Before writing any code, check if you are in a dedicated workspace.

- Run: `jj workspace list`
- **Result**:
    - If you see `default` or represent the root directory: **STOP**. Go to Step 2.
    - If you are already in a subdirectory under `.workspaces/`: **PROCEED** to Step 3.

## Step 2: Create a Workspace
If you need to edit code and are in the root, create a new isolated workspace.

1.  **Create**: `jj workspace add .workspaces/<meaningful-name> -r @`
    - *Example*: `jj workspace add .workspaces/feat-login-ui -r @`

## Step 3: Develop & Test
Perform all your changes within this workspace.

- **Edit** files ONLY within `.workspaces/<meaningful-name>` directory.
- **Run tests** from this directory to ensure isolation.
- *NEVER*: Editing files in the standard `./lattice/src/...` path from the root, except for the implementation plan and walk through docs.

## Step 4: Commit Changes
When your work is ready, commit it.

- Run: `jj workspace update-stale && jj log`
- After checking output, run: `jj commit -m "Your descriptive message"`


## Step 5: Cleanup
Once your changes are committed, immediately clean up the workspace before notifying user.

1.  **Forget Workspace**: `jj workspace forget <workspace-name>`
    -   *Note*: Use the **name**, not the path (e.g., `feat-login-ui`, NOT `.workspaces/feat-login-ui`).
2.  **Remove Directory**: `rm -rf .workspaces/<meaningful-name>`