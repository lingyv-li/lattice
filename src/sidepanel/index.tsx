import React from 'react';
import ReactDOM from 'react-dom/client';
import { Bot } from 'lucide-react';
import './index.css';
import { TabGrouper } from './TabGrouper';
import { DownloadCleaner } from './DownloadCleaner';

const App = () => {
    const [modelInfo, setModelInfo] = React.useState<string>("Checking model...");

    React.useEffect(() => {
        const checkModel = async () => {
            try {
                if (!window.LanguageModel) {
                    setModelInfo("AI API not supported");
                    return;
                }
                if ('capabilities' in window.LanguageModel) {
                    // @ts-ignore
                    const caps = await window.LanguageModel.capabilities();
                    setModelInfo(`Local AI Model (${caps.available})`);
                } else {
                    // Fallback to availability check
                    const text = await window.LanguageModel.availability();
                    setModelInfo(`Local AI Model (${text})`);
                }
            } catch (e) {
                setModelInfo("Model check failed");
            }
        };
        checkModel();
    }, []);

    return (
        <div className="min-h-screen w-screen bg-white dark:bg-zinc-950 flex flex-col font-sans text-zinc-900 dark:text-zinc-100">
            {/* Header */}
            <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-10">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-white">
                    <Bot className="w-5 h-5" />
                </div>
                <div>
                    <h1 className="font-bold text-sm leading-tight">Lattice</h1>
                    <p className="text-[10px] text-zinc-500 font-medium">AI Browser Organizer</p>
                </div>
            </div>

            {/* Dashboard Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">

                {/* Section: Optimization */}
                <div className="space-y-2">
                    <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider px-1">Optimization</h2>
                    <DownloadCleaner />
                </div>

                {/* Section: Organization */}
                <div className="space-y-2">
                    <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider px-1">Organization</h2>
                    <TabGrouper />
                </div>

                <div className="text-center py-6 opacity-40">
                    <p className="text-[10px] text-zinc-500">
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
