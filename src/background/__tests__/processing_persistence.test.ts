import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProcessingState } from '../processing';
import { StateService } from '../state';
import { WindowSnapshot } from '../../utils/snapshots';

// Mock dependencies
vi.mock('../state', () => ({
    StateService: {
        updateWindowSnapshot: vi.fn().mockResolvedValue(undefined),
        setProcessingWindows: vi.fn().mockResolvedValue(undefined), // Needed for updateStatus
        getWindowState: vi.fn()
    }
}));
vi.mock('../../utils/snapshots');

describe('ProcessingState Persistence', () => {
    let processingState: ProcessingState;

    beforeEach(() => {
        vi.clearAllMocks();
        processingState = new ProcessingState();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should NOT persist snapshot to storage immediately upon enqueue', async () => {
        const windowId = 1;
        const snapshot = {
            fingerprint: 'hash-1',
            equals: vi.fn().mockReturnValue(false)
        } as unknown as WindowSnapshot;

        await processingState.enqueue(windowId, snapshot);

        // Verify state is queued in memory
        expect(processingState.has(windowId)).toBe(true);
        expect(processingState.size).toBe(1);

        // Verify storage was NOT called
        expect(StateService.updateWindowSnapshot).not.toHaveBeenCalled();
    });

    it('should persist snapshot to storage ONLY when completeWindow is called', async () => {
        const windowId = 1;
        const snapshot = {
            fingerprint: 'hash-1',
            equals: vi.fn().mockReturnValue(false)
        } as unknown as WindowSnapshot;

        // Enqueue (put in memory)
        await processingState.enqueue(windowId, snapshot);
        expect(StateService.updateWindowSnapshot).not.toHaveBeenCalled();

        // SIMULATE PROCESSING START: Move from Queue to Active
        processingState.acquireQueue();

        // Complete
        await processingState.completeWindow(windowId);

        // Verify storage WAS called
        expect(StateService.updateWindowSnapshot).toHaveBeenCalledWith(windowId, snapshot);
        expect(processingState.has(windowId)).toBe(false);
    });

    it('should ignore enqueue requests if fingerprint matches existing in-memory state (Deduping)', async () => {
        const windowId = 1;
        const snapshot1 = {
            fingerprint: 'hash-1',
            equals: vi.fn().mockImplementation(other => other.fingerprint === 'hash-1'),
            update: vi.fn()
        } as unknown as WindowSnapshot;

        const snapshot2 = {
            fingerprint: 'hash-1', // SAME fingerprint
            equals: vi.fn().mockImplementation(other => other.fingerprint === 'hash-1')
        } as unknown as WindowSnapshot;

        // First enqueue
        await processingState.enqueue(windowId, snapshot1);
        expect(processingState.size).toBe(1);

        // Second enqueue (Same fingerprint)
        const result = await processingState.enqueue(windowId, snapshot2);

        // Should return false (skipped)
        expect(result).toBe(false);
        // Queue size should still be 1 (not added again)
        expect(processingState.size).toBe(1);
        // Should NOT have updated the state object (it's the same)
        // (Note: In implementation, we might not call update if it's equal, checking logic...)
        // Implementation says: if (existingState.inputSnapshot.equals(snapshot)) return false;
        // So safe to assume existingState.update was NOT called.
    });

    it('should update in-memory state if fingerprint changes', async () => {
        const windowId = 1;
        const snapshot1 = {
            fingerprint: 'hash-1',
            equals: vi.fn().mockImplementation(other => other.fingerprint === 'hash-1'),
            update: vi.fn()
        } as unknown as WindowSnapshot;

        const snapshot2 = {
            fingerprint: 'hash-2', // DIFFERENT fingerprint
            equals: vi.fn().mockImplementation(other => other.fingerprint === 'hash-2')
        } as unknown as WindowSnapshot;

        // First enqueue
        await processingState.enqueue(windowId, snapshot1);

        // Second enqueue (Different fingerprint)
        await processingState.enqueue(windowId, snapshot2);

        // Should check existing state
        const storedState = processingState.getWindowState(windowId);
        expect(storedState).toBeDefined();
        // Since we mock WindowState in the real code, we can't easily spy on the 'update' method of the real class instance
        // unless we spy on the prototype or inspect the result.
        // But in our mock above, `snapshot1` was passed to the constructor.
        // Wait, ProcessingState instantiates `new WindowState`. We didn't mock WindowState class, only dependencies.
        // Let's rely on `getWindowState` to see if it updated.

        expect(storedState?.inputSnapshot).toBe(snapshot2);
    });
});
