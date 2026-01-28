import { Sparkles, Copy } from 'lucide-react';

export const OnboardingWelcome = () => {
    return (
        <div className='space-y-8 animate-in fade-in slide-in-from-right-4 duration-300'>
            <div className='text-center space-y-4'>
                <div className='w-24 h-24 mx-auto rounded-full bg-gradient-brand flex items-center justify-center shadow-lg hover:scale-105 transition-transform'>
                    <Sparkles className='w-12 h-12 text-inverted' />
                </div>
                <h3 className='text-3xl font-bold text-main'>AI-Powered Tab Management</h3>
                <p className='text-muted text-base leading-relaxed max-w-md mx-auto'>
                    Lattice uses AI to automatically organize your tabs into groups and remove duplicates, helping you stay focused and productive.
                </p>
            </div>

            <div className='grid grid-cols-2 gap-4'>
                <div className='p-6 bg-surface-dim rounded-xl border border-border-subtle hover:border-brand-cloud/30 transition-colors'>
                    <div className='flex items-start gap-4'>
                        <Sparkles className='w-6 h-6 text-brand-cloud flex-shrink-0 mt-0.5' />
                        <div>
                            <h4 className='font-semibold text-base text-main mb-1'>Smart Tab Grouping</h4>
                            <p className='text-sm text-muted'>AI analyzes your tabs and suggests intelligent groupings</p>
                        </div>
                    </div>
                </div>

                <div className='p-6 bg-surface-dim rounded-xl border border-border-subtle hover:border-brand-local/30 transition-colors'>
                    <div className='flex items-start gap-4'>
                        <Copy className='w-6 h-6 text-brand-local flex-shrink-0 mt-0.5' />
                        <div>
                            <h4 className='font-semibold text-base text-main mb-1'>Duplicate Detection</h4>
                            <p className='text-sm text-muted'>Automatically find and close duplicate tabs</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
