import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SelectionCard } from '../SelectionCard';
import { Check } from 'lucide-react';

describe('SelectionCard Accessibility', () => {
    it('should have an accessible checkbox button with correct aria attributes', () => {
        render(
            <SelectionCard
                isSelected={true}
                onToggle={() => {}}
                title="Test Card"
                icon={Check}
            >
                <div>Content</div>
            </SelectionCard>
        );

        // Find the button by its aria-label (dynamic based on title)
        const checkboxBtn = screen.getByRole('button', { name: /Deselect Test Card/i });
        expect(checkboxBtn).toBeInTheDocument();
        expect(checkboxBtn).toHaveAttribute('aria-pressed', 'true');
    });

    it('should show "Select" label when not selected', () => {
        render(
            <SelectionCard
                isSelected={false}
                onToggle={() => {}}
                title="Test Card"
                icon={Check}
            >
                <div>Content</div>
            </SelectionCard>
        );

        const checkboxBtn = screen.getByRole('button', { name: /Select Test Card/i });
        expect(checkboxBtn).toBeInTheDocument();
        expect(checkboxBtn).toHaveAttribute('aria-pressed', 'false');
    });

    it('should be disabled when card is disabled', () => {
        render(
            <SelectionCard
                isSelected={false}
                onToggle={() => {}}
                title="Test Card"
                icon={Check}
                disabled={true}
            >
                <div>Content</div>
            </SelectionCard>
        );

        const checkboxBtn = screen.getByRole('button', { name: /Select Test Card/i });
        expect(checkboxBtn).toBeDisabled();
    });

    it('should call onToggle when button is clicked', () => {
        const onToggle = vi.fn();
        render(
            <SelectionCard
                isSelected={false}
                onToggle={onToggle}
                title="Test Card"
                icon={Check}
            >
                <div>Content</div>
            </SelectionCard>
        );

        const checkboxBtn = screen.getByRole('button', { name: /Select Test Card/i });
        checkboxBtn.click();
        expect(onToggle).toHaveBeenCalledTimes(1);
    });
});
