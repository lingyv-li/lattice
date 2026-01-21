import React from 'react';
import { LucideIcon, ArrowRight, Loader2 } from 'lucide-react';
import { SuggestionType, SuggestionTab } from '../../types/suggestions';

interface SuggestionItemProps {
    title: string;
    description: string;
    icon: LucideIcon;
    type: SuggestionType;
    onClick: () => void;
    isLoading?: boolean;
    disabled?: boolean;
    tabs?: SuggestionTab[];
}

export const SuggestionItem: React.FC<SuggestionItemProps> = ({
    title,
    description,
    icon: Icon,
    type,
    onClick,
    isLoading,
    disabled,
    tabs
}) => {
    // Aggregate identical tabs
    const groupedTabs = React.useMemo(() => {
        if (!tabs) return [];
        const groups = new Map<string, { count: number, tab: typeof tabs[0] }>();

        tabs.forEach(tab => {
            // Create a unique key for grouping (title + favicon)
            const key = `${tab.title || ''}|${tab.favIconUrl || ''}`;
            const existing = groups.get(key);
            if (existing) {
                existing.count++;
            } else {
                groups.set(key, { count: 1, tab });
            }
        });

        return Array.from(groups.values());
    }, [tabs]);

    return (
        <div className={`
            w-full group relative overflow-hidden
            bg-surface border rounded-lg transition-all duration-200
            ${disabled ? 'opacity-50 pointer-events-none' : 'hover:border-action hover:bg-surface-highlight border-border-subtle'}
        `} >
            {/* Header / Action Area */}
            <button
                type="button"
                className="w-full flex items-center gap-2 p-2 cursor-pointer text-left focus-visible:ring-2 focus-visible:ring-action focus-visible:outline-none rounded-md disabled:cursor-not-allowed"
                onClick={onClick}
                disabled={disabled || isLoading}
            >
                <div className={`
                    p-1.5 rounded-md shrink-0
                    ${type === SuggestionType.Group ? 'bg-indigo-500/10 text-indigo-500' : 'bg-rose-500/10 text-rose-500'}
                `}>
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
                </div>

                <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-main truncate text-sm leading-tight">{title}</h3>
                    <p className="text-[10px] text-muted truncate leading-tight">{description}</p>
                </div>

                <div className={`
                    flex items-center gap-1.5 px-2 py-1 rounded-full transition-all duration-200
                    text-muted group-hover:text-action group-hover:bg-action/10
                    ${isLoading ? 'opacity-0' : ''}
                `}>
                    <span className="text-[10px] font-semibold uppercase tracking-wide opacity-0 w-0 group-hover:w-auto group-hover:opacity-100 transition-all duration-200 overflow-hidden whitespace-nowrap">
                        Apply
                    </span>
                    {!isLoading && <ArrowRight className="w-3.5 h-3.5" />}
                </div>
            </button>

            {/* Tab List - Always Visible & Compact */}
            {
                groupedTabs.length > 0 && (
                    <div className="px-2 pb-2 pl-9 space-y-0.5">
                        {groupedTabs.map(({ tab, count }, idx) => (
                            <div key={idx} className="flex items-center gap-2 overflow-hidden opacity-80">
                                {tab.favIconUrl ? (
                                    <img src={tab.favIconUrl} className="w-3 h-3 shrink-0" alt="" onError={(e) => e.currentTarget.style.display = 'none'} />
                                ) : (
                                    <div className="w-2 h-2 rounded-full bg-border-strong shrink-0" />
                                )}
                                <span className="truncate text-[11px] text-muted leading-tight flex-1">
                                    {tab.title || tab.url || 'Untitled'}
                                </span>
                                {count > 1 && (
                                    <span className="text-[10px] font-medium text-muted bg-surface-dim px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                        x{count}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                )
            }
        </div >
    );
};
