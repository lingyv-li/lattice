import { OnboardingModal } from '../sidepanel/components/OnboardingModal';

export const App = () => {
    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-4">
            <OnboardingModal onComplete={() => window.close()} />
        </div>
    );
};
