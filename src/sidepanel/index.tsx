import React from 'react';
import ReactDOM from 'react-dom/client';
import { Settings } from 'lucide-react';
import './index.css';
import { TabGrouper } from './TabGrouper';
import { DownloadCleaner } from './DownloadCleaner';
import { DuplicateTabCleaner } from './DuplicateTabCleaner';

const App = () => {
    const [modelInfo, setModelInfo] = React.useState<string>("Checking model...");

    React.useEffect(() => {
        const checkModel = async () => {
            try {
                if (!window.LanguageModel) {
                    setModelInfo("AI API not supported");
                    return;
                }
                // Fallback to availability check
                const text = await window.LanguageModel.availability();
                setModelInfo(`Local AI Model (${text})`);
            } catch (e) {
                setModelInfo("Model check failed");
            }
        };
        checkModel();
    }, []);

    return (
        <div className="h-screen w-full bg-surface flex flex-col font-sans text-main">
            {/* Header */}
            {/* Header */}
            <div className="p-4 border-b border-border-subtle flex items-center justify-between bg-surface/80 backdrop-blur-sm sticky top-0 z-10">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-white shadow-sm">
                        <img src="/icon.svg" className="w-5 h-5" alt="Logo" />
                    </div>
                    <div>
                        <h1 className="font-bold text-sm leading-tight text-main">Lattice</h1>
                        <p className="text-[10px] text-muted font-medium">AI Browser Organizer</p>
                    </div>
                </div>
                <button
                    onClick={() => chrome.runtime.openOptionsPage()}
                    className="p-2 rounded-lg text-muted hover:text-main hover:bg-surface-highlight transition-all duration-200 cursor-pointer"
                    title="Settings"
                >
                    <Settings className="w-4 h-4" />
                </button>
            </div>

            {/* Dashboard Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">

                {/* Section: Organization */}
                <div className="space-y-2">
                    <h2 className="text-xs font-bold text-muted uppercase tracking-wider px-1">Organization</h2>
                    <TabGrouper />
                    <DuplicateTabCleaner />
                </div>

                {/* Section: Optimization */}
                <div className="space-y-2">
                    <h2 className="text-xs font-bold text-muted uppercase tracking-wider px-1">Optimization</h2>
                    <DownloadCleaner />
                </div>

                <div className="text-center py-6 opacity-40">
                    <p className="text-[10px] text-muted">
                        {modelInfo}
                    </p>
                </div>
            </div>
        </div>
    );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
