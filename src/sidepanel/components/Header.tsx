import { Settings } from 'lucide-react';

export const Header = () => (
    <div className="px-4 py-2 border-b border-border-subtle flex items-center justify-between bg-surface/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-brand flex items-center justify-center text-inverted shadow-sm">
                <img src="/icon-backgroundless.svg" className="w-4 h-4" alt="Logo" />
            </div>
        </div>
        <button
            onClick={() => chrome.runtime.openOptionsPage()}
            className="flex items-center gap-2 p-2 px-3 rounded-lg text-muted hover:text-main hover:bg-surface-highlight transition-all duration-200 cursor-pointer"
            title="Options"
        >
            <Settings className="w-4 h-4" />
            <span className="text-sm font-medium">Options</span>
        </button>
    </div>
);
