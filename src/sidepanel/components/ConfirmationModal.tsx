import { AlertTriangle } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: string;
    confirmLabel?: string;
}

export const ConfirmationModal = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmLabel = "Enable"
}: ConfirmationModalProps) => {
    const confirmButtonRef = useRef<HTMLButtonElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    // Escape key handler
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isOpen && e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };

        if (isOpen) {
            // Store currently focused element to restore later
            previousFocusRef.current = document.activeElement as HTMLElement;
            window.addEventListener('keydown', handleKeyDown);

            // Focus the confirm button initially
            // Small timeout to ensure render is complete
            setTimeout(() => {
                confirmButtonRef.current?.focus();
            }, 50);
        }

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            // Restore focus when modal closes
            if (isOpen && previousFocusRef.current) {
                previousFocusRef.current.focus();
            }
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            aria-describedby="modal-description"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className="w-full max-w-[280px] bg-surface relative rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 scale-100 ring-1 ring-black/5"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Decorative Background Glow */}
                <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-amber-500/10 to-transparent pointer-events-none" />

                <div className="p-6 flex flex-col items-center text-center relative z-10">
                    {/* Icon */}
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4 text-amber-500 ring-4 ring-amber-500/5">
                        <AlertTriangle className="w-6 h-6" strokeWidth={2.5} />
                    </div>

                    {/* Content */}
                    <h3
                        id="modal-title"
                        className="font-bold text-main text-lg mb-2 leading-tight"
                    >
                        {title}
                    </h3>
                    <p
                        id="modal-description"
                        className="text-xs text-muted leading-relaxed mb-6"
                    >
                        {description}
                    </p>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 w-full">
                        <button
                            ref={confirmButtonRef}
                            onClick={() => {
                                onConfirm();
                                onClose();
                            }}
                            className="w-full py-2.5 px-4 text-xs font-bold text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:brightness-110 active:scale-[0.98] rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:outline-none"
                        >
                            <span>{confirmLabel}</span>
                        </button>
                        <button
                            onClick={onClose}
                            className="w-full py-2.5 px-4 text-xs font-medium text-muted hover:text-main hover:bg-surface-highlight rounded-xl transition-colors focus:ring-2 focus:ring-gray-200 focus:outline-none"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
