/**
 * Creates a debounced version of a function that delays invoking
 * the function until after `wait` milliseconds have elapsed since
 * the last time the debounced function was invoked.
 */
export interface DebouncedFunc<A extends unknown[]> {
    (...args: A): void;
    cancel: () => void;
}

export function debounce<A extends unknown[], R>(
    func: (...args: A) => R,
    wait: number
): DebouncedFunc<A> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const debounced = (...args: A) => {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            timeoutId = null;
            func(...args);
        }, wait);
    };

    debounced.cancel = () => {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    };

    return debounced;
}
