import { CheckCircle, LucideIcon } from 'lucide-react';

interface CleanStateProps {
    icon: LucideIcon;
    title: string;
    message: string;
}

export const CleanState = ({ icon: Icon, title, message }: CleanStateProps) => {
    return (
        <div className="p-4 bg-surface-dim rounded-xl border border-border-subtle mb-4">
            <div className="flex items-center gap-2 mb-2">
                <Icon className="w-5 h-5 text-muted" />
                <h3 className="font-bold text-sm text-main">{title}</h3>
            </div>
            <div className="flex flex-col items-center justify-center py-4 text-center">
                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-2">
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-muted text-xs">{message}</p>
            </div>
        </div>
    );
};
