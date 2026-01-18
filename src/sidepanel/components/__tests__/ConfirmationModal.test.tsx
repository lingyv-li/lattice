import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmationModal } from '../ConfirmationModal';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('ConfirmationModal', () => {
    const defaultProps = {
        isOpen: true,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        title: 'Confirm Action',
        description: 'Are you sure?',
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders correctly when open', () => {
        render(<ConfirmationModal {...defaultProps} />);
        expect(screen.getByText('Confirm Action')).toBeInTheDocument();
        expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    });

    it('does not render when closed', () => {
        render(<ConfirmationModal {...defaultProps} isOpen={false} />);
        expect(screen.queryByText('Confirm Action')).toBeNull();
    });

    it('calls onConfirm and onClose when confirm button is clicked', () => {
        render(<ConfirmationModal {...defaultProps} />);
        fireEvent.click(screen.getByText('Enable'));
        expect(defaultProps.onConfirm).toHaveBeenCalled();
        expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('calls onClose when cancel button is clicked', () => {
        render(<ConfirmationModal {...defaultProps} />);
        fireEvent.click(screen.getByText('Cancel'));
        expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('has correct accessibility attributes', () => {
        render(<ConfirmationModal {...defaultProps} />);
        const dialog = screen.getByRole('alertdialog');
        expect(dialog).toBeInTheDocument();
        expect(dialog).toHaveAttribute('aria-modal', 'true');

        // Verify labelledby and describedby
        const titleId = dialog.getAttribute('aria-labelledby');
        const descId = dialog.getAttribute('aria-describedby');
        expect(titleId).toBeTruthy();
        expect(descId).toBeTruthy();

        expect(document.getElementById(titleId!)?.textContent).toBe('Confirm Action');
        expect(document.getElementById(descId!)?.textContent).toBe('Are you sure?');
    });

    it('closes on Escape key press', () => {
        render(<ConfirmationModal {...defaultProps} />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('closes on backdrop click', () => {
        const { container } = render(<ConfirmationModal {...defaultProps} />);
        // The first child should be the backdrop
        const backdrop = container.firstChild as HTMLElement;
        fireEvent.click(backdrop);
        expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('does not close when clicking inside the modal content', () => {
         render(<ConfirmationModal {...defaultProps} />);
         fireEvent.click(screen.getByText('Confirm Action'));
         expect(defaultProps.onClose).not.toHaveBeenCalled();
    });

    it('focuses the cancel button on mount', () => {
        render(<ConfirmationModal {...defaultProps} />);
        expect(screen.getByText('Cancel')).toHaveFocus();
    });
});
