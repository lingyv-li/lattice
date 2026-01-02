
import { createContext } from 'react';
import { ToastType } from '../types/toast';

export interface ToastContextType {
    showToast: (message: string, type: ToastType, duration?: number) => void;
    removeToast: (id: string) => void;
}

export const ToastContext = createContext<ToastContextType | undefined>(undefined);
