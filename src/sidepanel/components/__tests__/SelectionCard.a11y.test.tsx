import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { SelectionCard } from '../SelectionCard';
import { Check } from 'lucide-react';

describe('SelectionCard Accessibility', () => {
    it('should have correct role and aria-checked attribute', () => {
        render(
            <SelectionCard
                isSelected={true}
                onToggle={vi.fn()}
                title="Test Card"
                icon={Check}
            >
                <div>Content</div>
            </SelectionCard>
        );

        const card = screen.getByRole('checkbox');
        expect(card).toBeInTheDocument();
        expect(card).toHaveAttribute('aria-checked', 'true');
    });

    it('should be focusable via keyboard', () => {
        render(
            <SelectionCard
                isSelected={false}
                onToggle={vi.fn()}
                title="Test Card"
                icon={Check}
            >
                <div>Content</div>
            </SelectionCard>
        );

        const card = screen.getByRole('checkbox');
        expect(card).toHaveAttribute('tabIndex', '0');
    });

    it('should not be focusable when disabled', () => {
        render(
            <SelectionCard
                isSelected={false}
                onToggle={vi.fn()}
                title="Test Card"
                icon={Check}
                disabled={true}
            >
                <div>Content</div>
            </SelectionCard>
        );

        // When disabled, it might not have role="checkbox" depending on implementation,
        // or it should have aria-disabled="true".
        // But for tabIndex, we can query by text or other means if role is missing.
        // Assuming we keep the role but change tabIndex.
        const card = screen.getByRole('checkbox');
        expect(card).toHaveAttribute('tabIndex', '-1');
    });

    it('should toggle on Enter key', () => {
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

        const card = screen.getByRole('checkbox');
        fireEvent.keyDown(card, { key: 'Enter', code: 'Enter' });
        expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('should toggle on Space key', () => {
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

        const card = screen.getByRole('checkbox');
        fireEvent.keyDown(card, { key: ' ', code: 'Space' });
        expect(onToggle).toHaveBeenCalledTimes(1);
    });
});
