import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfirmationModal } from '../ConfirmationModal';
import { vi, describe, it, expect } from 'vitest';

describe('ConfirmationModal', () => {
    it('should render correctly when open', () => {
        render(
            <ConfirmationModal
                isOpen={true}
                onClose={vi.fn()}
                onConfirm={vi.fn()}
                title="Test Title"
                description="Test Description"
            />
        );

        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('Test Title')).toBeInTheDocument();
        expect(screen.getByText('Test Description')).toBeInTheDocument();
    });

    it('should not render when closed', () => {
        render(
            <ConfirmationModal
                isOpen={false}
                onClose={vi.fn()}
                onConfirm={vi.fn()}
                title="Test Title"
                description="Test Description"
            />
        );

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should have accessible attributes', () => {
        render(
            <ConfirmationModal
                isOpen={true}
                onClose={vi.fn()}
                onConfirm={vi.fn()}
                title="Test Title"
                description="Test Description"
            />
        );

        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(dialog).toHaveAttribute('aria-labelledby');
        expect(dialog).toHaveAttribute('aria-describedby');
    });

    it('should close on Escape key', () => {
        const onClose = vi.fn();
        render(
            <ConfirmationModal
                isOpen={true}
                onClose={onClose}
                onConfirm={vi.fn()}
                title="Test Title"
                description="Test Description"
            />
        );

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });

    it('should focus the dialog content on open', async () => {
        render(
            <ConfirmationModal
                isOpen={true}
                onClose={vi.fn()}
                onConfirm={vi.fn()}
                title="Test Title"
                description="Test Description"
            />
        );

        // The dialog inner container has tabIndex={-1} and is focused
        // We look for the div with tabIndex -1 inside the dialog role
        // Or we can check if the active element is contained within the dialog

        // Wait for focus to be applied (though it's synchronous in useEffect)
        await waitFor(() => {
             // In JSDOM, document.activeElement should be updated
             const dialogContent = screen.getByRole('dialog').querySelector('div[tabindex="-1"]');
             expect(document.activeElement).toBe(dialogContent);
        });
    });
});
