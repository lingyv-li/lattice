import { Settings, Loader2, Undo2 } from 'lucide-react';
import { useActionHistory } from '../../hooks/useActionHistory';

interface HeaderProps {
    isLoading?: boolean;
}

export const Header = ({ isLoading }: HeaderProps) => {
    const { hasUndoableHistory, undoLast, isUndoing } = useActionHistory();

    return (
        <div className='px-4 py-2 border-b border-border-subtle flex items-center justify-between bg-surface/80 backdrop-blur-sm sticky top-0 z-10'>
            <div className='flex items-center gap-2'>
                <div className='w-7 h-7 rounded-full bg-gradient-brand flex items-center justify-center text-inverted shadow-sm'>
                    <img src='/icon-backgroundless.svg' className='w-4 h-4' alt='Logo' />
                </div>
                {isLoading && (
                    <div className='flex items-center gap-1.5 px-2 py-0.5 bg-surface-highlight/50 rounded-full animate-pulse'>
                        <Loader2 className='w-3 h-3 text-action animate-spin' />
                        <span className='text-[10px] font-medium text-muted'>Analyzing...</span>
                    </div>
                )}
            </div>
            <div className='flex items-center gap-1'>
                {hasUndoableHistory && (
                    <button
                        type='button'
                        onClick={undoLast}
                        disabled={isUndoing}
                        className='flex items-center justify-center p-2 rounded-lg text-muted hover:text-main hover:bg-surface-highlight transition-all border border-border-subtle'
                        title='Undo last action'
                        aria-label='Undo last action'
                    >
                        {isUndoing ? <Loader2 className='w-4 h-4 animate-spin' /> : <Undo2 className='w-4 h-4' />}
                    </button>
                )}
                <button
                    onClick={() => chrome.runtime.openOptionsPage()}
                    className='flex items-center gap-2 p-2 px-3 rounded-lg text-muted hover:text-main hover:bg-surface-highlight transition-all duration-200 cursor-pointer'
                    title='Options'
                >
                    <Settings className='w-4 h-4' />
                </button>
            </div>
        </div>
    );
};
