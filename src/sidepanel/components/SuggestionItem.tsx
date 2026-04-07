import React from 'react';
import { LucideIcon, ArrowRight, Loader2, X } from 'lucide-react';
import { SuggestionType, SuggestionTab } from '../../types/suggestions';

interface SuggestionItemProps {
    title: string;
    description: string;
    icon: LucideIcon;
    type: SuggestionType;
    onClick: () => void;
    onDismiss?: () => void;
    isLoading?: boolean;
    disabled?: boolean;
    tabs?: SuggestionTab[];
}

export const SuggestionItem: React.FC<SuggestionItemProps> = ({ title, description, icon: Icon, type, onClick, onDismiss, isLoading, disabled, tabs }) => {
    const canReject = !!onDismiss && type === SuggestionType.Group;

    const groupedTabs = React.useMemo(() => {
        if (!tabs) return [];
        const groups = new Map<string, { count: number; tab: (typeof tabs)[0] }>();
        tabs.forEach(tab => {
            const key = `${tab.title || ''}|${tab.favIconUrl || ''}`;
            const existing = groups.get(key);
            if (existing) existing.count++;
            else groups.set(key, { count: 1, tab });
        });
        return Array.from(groups.values());
    }, [tabs]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!disabled && !isLoading) onClick();
        }
    };

    return (
        <div
            role='button'
            tabIndex={disabled || isLoading ? -1 : 0}
            className={`
            suggestion-item-card w-full group relative overflow-hidden cursor-pointer
            bg-surface border rounded-lg transition-all duration-200 border-border-subtle
            ${disabled ? 'opacity-50 pointer-events-none' : '[&:hover:not(:has(.reject-btn:hover))]:border-action [&:hover:not(:has(.reject-btn:hover))]:bg-surface-highlight'}
        `}
            onClick={onClick}
            onKeyDown={handleKeyDown}
            aria-label={`${title}: ${description}. Apply suggestion.`}
        >
            <div className='flex items-center gap-2 p-2'>
                <div className='flex flex-1 min-w-0 items-center gap-2'>
                    <div className={`p-1.5 rounded-md shrink-0 ${type === SuggestionType.Group ? 'bg-indigo-500/10 text-indigo-500' : 'bg-rose-500/10 text-rose-500'}`}>
                        {isLoading ? <Loader2 className='w-4 h-4 animate-spin' /> : <Icon className='w-4 h-4' />}
                    </div>
                    <div className='flex-1 min-w-0'>
                        <h3 className='font-medium text-main truncate text-sm leading-tight'>{title}</h3>
                        <p className='text-[10px] text-muted truncate leading-tight'>{description}</p>
                    </div>
                    <div
                        className={`
                        apply-pill flex items-center gap-1.5 px-2 py-1 rounded-full
                        text-muted group-hover:text-action group-hover:bg-action/10
                        transition-opacity duration-300
                        group-has-[.reject-btn:hover]:opacity-0
                        ${isLoading ? 'opacity-0' : ''}
                    `}
                    >
                        <span className='text-[10px] font-semibold uppercase tracking-wide opacity-0 w-0 group-hover:w-auto group-hover:opacity-100 transition-all duration-200 overflow-hidden whitespace-nowrap'>
                            Apply
                        </span>
                        {!isLoading && <ArrowRight className='w-3.5 h-3.5' />}
                    </div>
                </div>
                {canReject && (
                    <button
                        type='button'
                        className='reject-btn p-1.5 rounded-lg text-muted cursor-pointer hover:text-action hover:bg-surface-highlight shrink-0 transition-colors duration-200'
                        onClick={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDismiss();
                        }}
                        aria-label='Reject suggestion'
                    >
                        <X className='w-4 h-4' />
                    </button>
                )}
            </div>
            {groupedTabs.length > 0 && (
                <div className='px-2 pb-2 pl-9 space-y-0.5'>
                    {groupedTabs.map(({ tab, count }, idx) => (
                        <div key={idx} className='flex items-center gap-1.5 min-w-0'>
                            {tab.favIconUrl ? <img src={tab.favIconUrl} className='w-3 h-3 shrink-0 rounded-sm' alt='' /> : <div className='w-3 h-3 shrink-0 rounded-sm bg-border-subtle' />}
                            <span className='text-[10px] text-muted truncate leading-tight flex-1'>{tab.title || tab.url}</span>
                            {count > 1 && <span className='text-[10px] text-muted shrink-0 font-medium'>x{count}</span>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
