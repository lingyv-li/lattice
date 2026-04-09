import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind CSS classes with clsx and tailwind-merge.
 * Handles conditional classes and deduplicates conflicting utilities.
 */
export const cn = (...inputs: (string | undefined | null | false)[]) => twMerge(clsx(inputs));
