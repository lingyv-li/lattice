import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { ConfirmationModal } from '../ConfirmationModal';

describe('ConfirmationModal', () => {
    let defaultProps: {
        isOpen: boolean;
        onClose: () => void;
        onConfirm: () => void;
        title: string;
        description: string;
        confirmLabel: string;
    };

    // We keep references to the mocks to check calls
    let onCloseMock: Mock;
    let onConfirmMock: Mock;

    beforeEach(() => {
        onCloseMock = vi.fn();
        onConfirmMock = vi.fn();

        defaultProps = {
            isOpen: true,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onClose: onCloseMock as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onConfirm: onConfirmMock as any,
            title: "Test Modal",
            description: "Test Description",
            confirmLabel: "Confirm"
        };
    });

    it('renders with accessibility attributes', () => {
        render(<ConfirmationModal {...defaultProps} />);

        const dialog = screen.getByRole('dialog');
        expect(dialog).toBeInTheDocument();
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title');
        expect(dialog).toHaveAttribute('aria-describedby', 'modal-description');
    });

    it('focuses the confirm button on mount', async () => {
        render(<ConfirmationModal {...defaultProps} />);

        await waitFor(() => {
            const confirmButton = screen.getByText('Confirm').closest('button');
            expect(document.activeElement).toBe(confirmButton);
        });
    });

    it('traps focus (partial) and handles escape key', () => {
        render(<ConfirmationModal {...defaultProps} />);

        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onCloseMock).toHaveBeenCalled();
    });

    it('closes on backdrop click', () => {
        render(<ConfirmationModal {...defaultProps} />);

        const dialog = screen.getByRole('dialog');
        fireEvent.click(dialog);
        expect(onCloseMock).toHaveBeenCalled();
    });

    it('does not close on content click', () => {
        render(<ConfirmationModal {...defaultProps} />);

        const title = screen.getByText('Test Modal');
        fireEvent.click(title);
        expect(onCloseMock).not.toHaveBeenCalled();
    });
});
