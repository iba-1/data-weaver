import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditableCell } from '../EditableCell';

describe('EditableCell with a date', () => {
  const date = new Date('2024-01-15T00:00:00.000Z');

  it('shows the calendar date, not the local time', () => {
    render(<EditableCell value={date} onSave={() => {}} />);
    expect(screen.getByRole('gridcell')).toHaveTextContent(/^2024-01-15$/);
  });

  it('edits and saves the date unchanged', () => {
    const onSave = vi.fn();
    render(<EditableCell value={date} onSave={onSave} />);

    fireEvent.click(screen.getByRole('gridcell'));
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('2024-01-15');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).toHaveBeenCalledWith('2024-01-15');
  });
});
