import { CheckCircle, LucideIcon } from 'lucide-react';

interface CleanStateProps {
    icon: LucideIcon;
    title: string;
    message: string;
}

export const CleanState = ({ icon: Icon, title, message }: CleanStateProps) => {
    return (
        <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 mb-4">
            <div className="flex items-center gap-2 mb-2">
                <Icon className="w-5 h-5 text-zinc-400" />
                <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">{title}</h3>
            </div>
            <div className="flex flex-col items-center justify-center py-4 text-center">
                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-2">
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-zinc-500 text-xs">{message}</p>
            </div>
        </div>
    );
};
