import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OnboardingModal } from '../OnboardingModal';
import { SettingsStorage, AIProviderType } from '../../../utils/storage';
import { LocalProvider } from '../../../services/ai/LocalProvider';
import { AIService } from '../../../services/ai/AIService';

// Mock dependencies
vi.mock('../../../utils/storage', async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        SettingsStorage: {
            get: vi.fn(),
            set: vi.fn(),
            subscribe: vi.fn(() => () => { })
        }
    };
});

vi.mock('../../../services/ai/LocalProvider', () => ({
    LocalProvider: {
        checkAvailability: vi.fn(),
        downloadModel: vi.fn()
    }
}));

vi.mock('../../../services/ai/AIService', () => ({
    AIService: {
        listGeminiModels: vi.fn()
    }
}));

describe('OnboardingModal', () => {
    const mockOnComplete = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        // Default mocks
        vi.mocked(SettingsStorage.get).mockResolvedValue({} as any);
        vi.mocked(LocalProvider.checkAvailability).mockResolvedValue('readily' as any);
    });

    it('renders initial welcome step', async () => {
        render(<OnboardingModal onComplete={mockOnComplete} />);
        expect(screen.getByText('AI-Powered Tab Management')).toBeInTheDocument();
        expect(screen.getByText('Smart Tab Grouping')).toBeInTheDocument();
    });

    it('navigates to AI Setup step', async () => {
        render(<OnboardingModal onComplete={mockOnComplete} />);

        const nextButton = screen.getByText('Next');
        fireEvent.click(nextButton);

        await waitFor(() => {
            expect(screen.getByText('Choose Your AI Provider')).toBeInTheDocument();
        });
    });

    it('handles Local AI selection', async () => {
        render(<OnboardingModal onComplete={mockOnComplete} />);

        // Go to Setup
        fireEvent.click(screen.getByText('Next'));

        // Select Local AI
        await waitFor(() => {
            const localBtn = screen.getByText('Local AI').closest('button');
            fireEvent.click(localBtn!);
        });

        // Verify selection state (by checking if Next is enabled, logic depends on implementation)
        // Ideally check for visual feedback class, but for now we trust the state update

        // Click Next to trigger download/save
        fireEvent.click(screen.getByText('Next'));

        await waitFor(() => {
            expect(LocalProvider.downloadModel).toHaveBeenCalled();
            expect(SettingsStorage.set).toHaveBeenCalledWith(expect.objectContaining({
                aiProvider: AIProviderType.Local
            }));
        });
    });

    it('handles Gemini AI selection and API key input', async () => {
        vi.mocked(AIService.listGeminiModels).mockResolvedValue([
            { id: 'gemini-pro', displayName: 'Gemini Pro' }
        ] as any);

        render(<OnboardingModal onComplete={mockOnComplete} />);

        // Go to Setup
        fireEvent.click(screen.getByText('Next'));

        // Select Gemini
        const geminiBtn = screen.getByText('Google Gemini').closest('button');
        fireEvent.click(geminiBtn!);

        // Input API Key
        const input = screen.getByPlaceholderText('Enter your API key');
        fireEvent.change(input, { target: { value: 'test-api-key-12345678901234567890' } });

        await waitFor(() => {
            expect(AIService.listGeminiModels).toHaveBeenCalled();
        });
    });

    it('completes onboarding', async () => {
        render(<OnboardingModal onComplete={mockOnComplete} />);

        // Welcome -> Setup
        fireEvent.click(screen.getByText('Next'));

        // Setup -> Complete (Skip setup for speed)
        const skipBtn = screen.getByText('Skip setup (configure later)');
        fireEvent.click(skipBtn);

        await waitFor(() => {
            expect(screen.getByText("You're All Set!")).toBeInTheDocument();
        });

        // Complete -> Finish
        fireEvent.click(screen.getByText('Next'));
        expect(mockOnComplete).toHaveBeenCalled();
    });
});
