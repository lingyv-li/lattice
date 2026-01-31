import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfirmationModal, ConfirmationModalProps } from '../ConfirmationModal';

describe('ConfirmationModal', () => {
    let defaultProps: ConfirmationModalProps;

    beforeEach(() => {
        defaultProps = {
            isOpen: true,
            onClose: vi.fn(),
            onConfirm: vi.fn(),
            title: 'Confirm Action',
            description: 'Are you sure?',
        };
    });

    it('does not render when isOpen is false', () => {
        render(<ConfirmationModal {...defaultProps} isOpen={false} />);
        expect(screen.queryByText('Confirm Action')).toBeNull();
    });

    it('renders content when isOpen is true', () => {
        render(<ConfirmationModal {...defaultProps} />);
        expect(screen.getByText('Confirm Action')).toBeInTheDocument();
        expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    });

    it('has correct accessibility attributes', () => {
        render(<ConfirmationModal {...defaultProps} />);
        const dialog = screen.getByRole('alertdialog');
        expect(dialog).toBeInTheDocument();
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(dialog).toHaveAttribute('aria-labelledby');
        expect(dialog).toHaveAttribute('aria-describedby');
    });

    it('focuses cancel button on mount', () => {
        render(<ConfirmationModal {...defaultProps} />);
        expect(screen.getByText('Cancel')).toHaveFocus();
    });

    it('calls onClose when Escape key is pressed', () => {
        render(<ConfirmationModal {...defaultProps} />);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('calls onClose when backdrop is clicked', () => {
        render(<ConfirmationModal {...defaultProps} />);
        fireEvent.click(screen.getByRole('alertdialog'));
        expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('does NOT call onClose when content is clicked', () => {
        render(<ConfirmationModal {...defaultProps} />);
        fireEvent.click(screen.getByText('Confirm Action'));
        expect(defaultProps.onClose).not.toHaveBeenCalled();
    });

    it('calls onConfirm and onClose when Confirm is clicked', () => {
        render(<ConfirmationModal {...defaultProps} />);
        fireEvent.click(screen.getByText('Enable'));
        expect(defaultProps.onConfirm).toHaveBeenCalled();
        expect(defaultProps.onClose).toHaveBeenCalled();
    });
});
