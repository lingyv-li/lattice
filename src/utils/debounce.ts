/**
 * Creates a debounced version of a function that delays invoking
 * the function until after `wait` milliseconds have elapsed since
 * the last time the debounced function was invoked.
 */
export function debounce<A extends unknown[], R>(func: (...args: A) => R, wait: number): (...args: A) => void {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return (...args: A) => {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            timeoutId = null;
            func(...args);
        }, wait);
    };
}
