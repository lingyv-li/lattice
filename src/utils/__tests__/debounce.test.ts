import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../debounce';

describe('debounce', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should delay function execution', async () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced();
        expect(fn).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(100);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should only call function once for rapid successive calls', async () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced();
        debounced();
        debounced();

        await vi.advanceTimersByTimeAsync(100);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should reset timer on each call', async () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced();
        await vi.advanceTimersByTimeAsync(50);
        debounced(); // Reset timer
        await vi.advanceTimersByTimeAsync(50);
        expect(fn).not.toHaveBeenCalled(); // Still waiting

        await vi.advanceTimersByTimeAsync(50);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should pass arguments to the debounced function', async () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced('arg1', 'arg2');
        await vi.advanceTimersByTimeAsync(100);

        expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should use the last arguments when called multiple times', async () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced('first');
        debounced('second');
        debounced('third');

        await vi.advanceTimersByTimeAsync(100);

        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith('third');
    });

    it('should allow multiple separate debounced calls after delay', async () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced('first');
        await vi.advanceTimersByTimeAsync(100);
        expect(fn).toHaveBeenCalledTimes(1);

        debounced('second');
        await vi.advanceTimersByTimeAsync(100);
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should cancel the delayed execution', async () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced();
        debounced.cancel();

        await vi.advanceTimersByTimeAsync(150);
        expect(fn).not.toHaveBeenCalled();
    });
});
