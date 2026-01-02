import { Loader2 } from 'lucide-react';

interface FloatingActionProps {
    hasWork: boolean;
    isProcessing: boolean;
    buttonLabel: string;
    onOrganize: () => void;
}

export const FloatingAction = ({ hasWork, isProcessing, buttonLabel, onOrganize }: FloatingActionProps) => {
    return (
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-surface/90 backdrop-blur-md border-t border-border-subtle">
            <button
                onClick={onOrganize}
                disabled={!hasWork}
                className={`
                    w-full py-3 px-4 rounded-xl font-bold uppercase tracking-wide text-sm shadow-lg
                    flex items-center justify-center gap-2 transition-all active:scale-[0.98]
                    ${!hasWork
                        ? 'bg-surface-dim text-muted cursor-not-allowed shadow-none'
                        : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:shadow-blue-500/20 hover:brightness-110'
                    }
                `}
            >
                {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
                {buttonLabel}
            </button>
        </div>
    );
};
