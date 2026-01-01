import { Check, Zap } from 'lucide-react';

interface SelectionCardProps {
    isSelected: boolean;
    onToggle: () => void;
    title: string;
    icon: React.ElementType;
    description?: string;
    children: React.ReactNode;
    disabled?: boolean;
    badge?: React.ReactNode;
    autopilot?: {
        enabled: boolean;
        onToggle: (enabled: boolean) => void;
    };
    spinIcon?: boolean;
}

export const SelectionCard: React.FC<SelectionCardProps> = ({
    isSelected,
    onToggle,
    title,
    icon: Icon,
    description,
    children,
    disabled = false,
    badge,
    autopilot,
    spinIcon = false
}) => {
    return (
        <div
            onClick={!disabled ? onToggle : undefined}
            className={`
                group relative rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden
                ${disabled ? 'opacity-50 cursor-not-allowed bg-surface-dim border-border-subtle' : ''}
                ${isSelected && !disabled
                    ? 'bg-purple-50/50 dark:bg-purple-900/10 border-purple-500 shadow-sm ring-1 ring-purple-500/20'
                    : 'bg-surface-dim hover:bg-surface-highlight border-border-subtle hover:border-border-strong'
                }
            `}
        >
            {/* Header / Selection Area */}
            <div className="p-4 flex items-start gap-3">
                {/* Checkbox Indicator */}
                <div className={`
                    mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center transition-colors shrink-0
                    ${isSelected && !disabled
                        ? 'bg-purple-500 border-purple-500 text-white'
                        : 'border-muted text-transparent group-hover:border-purple-400'
                    }
                `}>
                    <Check className="w-3 h-3" strokeWidth={3} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <Icon className={`w-4 h-4 ${isSelected ? 'text-purple-500' : 'text-muted'} ${spinIcon ? 'animate-spin' : ''}`} />
                            <h3 className={`font-semibold text-sm ${isSelected ? 'text-purple-600 dark:text-purple-400' : 'text-main'}`}>
                                {title}
                            </h3>
                        </div>
                        {badge}
                    </div>

                    {description && (
                        <p className="text-xs text-muted mt-1 leading-relaxed">
                            {description}
                        </p>
                    )}
                </div>

                {/* Autopilot Toggle */}
                {autopilot && !disabled && isSelected && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            autopilot.onToggle(!autopilot.enabled);
                        }}
                        className={`
                            shrink-0 px-2 py-1.5 rounded-lg transition-all border flex items-center gap-1.5
                            ${autopilot.enabled
                                ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                                : 'bg-surface hover:bg-surface-highlight text-muted border-transparent hover:border-border-subtle'
                            }
                        `}
                        title={autopilot.enabled ? "Autopilot On" : "Enable Autopilot"}
                    >
                        <Zap className={`w-3.5 h-3.5 ${autopilot.enabled ? 'fill-amber-500 text-amber-500' : ''}`} />
                        <span className="text-[10px] font-semibold uppercase tracking-wide">
                            Autopilot
                        </span>
                    </button>
                )}
            </div>

            {/* Expandable/Interactive Content Area */}
            {/* We stop propagation here so interacting with inner controls doesn't toggle the card selection unless intended */}
            {children && (
                <div
                    className={`
                        px-4 pb-4 pt-0 transition-opacity
                        ${disabled ? 'opacity-50' : 'opacity-100'}
                    `}
                    onClick={(e) => {
                        // If the card is NOT selected, any click inside should select it.
                        // If it IS selected, we let the inner interaction happen (like unchecking a sub-item), and STOP it from toggling the card off.
                        if (!isSelected && !disabled) {
                            onToggle();
                        }
                        e.stopPropagation();
                    }}
                >
                    {children}
                </div>
            )}
        </div>
    );
};
