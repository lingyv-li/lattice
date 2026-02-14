import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Combines clsx and twMerge for conditional Tailwind classes. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
