import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmationModal } from '../ConfirmationModal';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('ConfirmationModal', () => {
    const defaultProps = {
        isOpen: true,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        title: 'Confirm Action',
        description: 'Are you sure you want to do this?',
        confirmLabel: 'Yes, do it'
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders when isOpen is true', () => {
        render(<ConfirmationModal {...defaultProps} />);
        expect(screen.getByText('Confirm Action')).toBeInTheDocument();
        expect(screen.getByText('Are you sure you want to do this?')).toBeInTheDocument();
    });

    it('does not render when isOpen is false', () => {
        render(<ConfirmationModal {...defaultProps} isOpen={false} />);
        expect(screen.queryByText('Confirm Action')).not.toBeInTheDocument();
    });

    it('calls onConfirm when confirm button is clicked', () => {
        render(<ConfirmationModal {...defaultProps} />);
        const confirmButton = screen.getByText('Yes, do it');
        fireEvent.click(confirmButton);
        expect(defaultProps.onConfirm).toHaveBeenCalled();
        expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('calls onClose when cancel button is clicked', () => {
        render(<ConfirmationModal {...defaultProps} />);
        const cancelButton = screen.getByText('Cancel');
        fireEvent.click(cancelButton);
        expect(defaultProps.onClose).toHaveBeenCalled();
    });

    // Accessibility Tests - These are expected to fail initially

    it('uses the correct accessibility role', () => {
        render(<ConfirmationModal {...defaultProps} />);
        // Should be 'alertdialog' for confirmation modals, or at least 'dialog'
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('has aria-modal attribute', () => {
        render(<ConfirmationModal {...defaultProps} />);
        const modal = screen.getByRole('alertdialog');
        expect(modal).toHaveAttribute('aria-modal', 'true');
    });

    it('is labelled by its title', () => {
        render(<ConfirmationModal {...defaultProps} />);
        const modal = screen.getByRole('alertdialog');
        // We need to check if aria-labelledby points to the title element
        // Since we don't know the ID yet, we'll check if the name matches the title
        expect(modal).toHaveAccessibleName('Confirm Action');
    });

    it('is described by its description', () => {
        render(<ConfirmationModal {...defaultProps} />);
        const modal = screen.getByRole('alertdialog');
        expect(modal).toHaveAccessibleDescription('Are you sure you want to do this?');
    });

    it('focuses the Cancel button on open', () => {
        render(<ConfirmationModal {...defaultProps} />);
        const cancelButton = screen.getByText('Cancel');
        expect(document.activeElement).toBe(cancelButton); // Safer default for destructive actions
    });

    it('closes on Escape key press', () => {
        render(<ConfirmationModal {...defaultProps} />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(defaultProps.onClose).toHaveBeenCalled();
    });
});
