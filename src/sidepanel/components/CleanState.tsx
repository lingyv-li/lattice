import { CheckCircle, LucideIcon } from 'lucide-react';

interface CleanStateProps {
    icon: LucideIcon;
    title: string;
    message: string;
}

export const CleanState = ({ icon: Icon, title, message }: CleanStateProps) => {
    return (
        <div className="p-3 bg-surface-dim rounded-xl border border-border-subtle mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <Icon className="size-[var(--size-icon-sm)] text-muted" />
                <span className="text-sm font-medium text-muted">{title}</span>
            </div>
            <div className="flex items-center gap-1.5">
                <CheckCircle className="size-[var(--size-icon-sm)] text-status-success-fg" />
                <span className="text-xs font-medium text-status-success-fg">{message}</span>
            </div>
        </div>
    );
};
