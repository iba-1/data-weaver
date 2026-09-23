import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DataValidator } from '../DataValidator';
import type { FieldConfig, RowValidation } from '@/lib/import-wizard/types';

type Key = 'name' | 'price';
type Rec = Record<Key, unknown>;

const FIELDS: FieldConfig<Key>[] = [
  { key: 'name', label: 'Name', type: 'string', required: true },
  { key: 'price', label: 'Price', type: 'number' },
];

function row(rowIndex: number, data: Rec): RowValidation<Rec> {
  return { rowIndex, data, originalData: {}, isValid: true, errors: [], warnings: [] };
}

function reviewStep(name: string) {
  const onRowsChange = vi.fn();
  const element = (
    <div data-testid={`wizard-${name}`}>
      <DataValidator<Rec, Key>
        validatedRows={[row(0, { name, price: 1 })]}
        fields={FIELDS}
        onRowsChange={onRowsChange}
        aiEdit={async () => []}
        onComplete={() => {}}
        onBack={() => {}}
      />
    </div>
  );
  const names = () => onRowsChange.mock.calls.at(-1)![0].map((r: RowValidation<Rec>) => r.data.name);
  return { element, names, scope: () => within(screen.getByTestId(`wizard-${name}`)) };
}

/** Render one review step with a single row named "Ada" */
function renderReview() {
  const step = reviewStep('Ada');
  render(step.element);
  return step;
}

/** Edit a cell the way an Importer does: click it, type, press Enter */
function editCell(scope: ReturnType<typeof within>, from: string, to: string) {
  fireEvent.click(scope.getByText(from));
  const input = scope.getByDisplayValue(from);
  fireEvent.change(input, { target: { value: to } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

/** Dispatch a key press on `target` and report whether the wizard claimed it */
function press(target: Element | Window, init: KeyboardEventInit): boolean {
  return !fireEvent.keyDown(target, init);
}

const UNDO = { key: 'z', ctrlKey: true };

describe('undo/redo shortcuts in the review step', () => {
  it('Ctrl+Z undoes the last grid change', () => {
    const { names, scope } = renderReview();
    editCell(scope(), 'Ada', 'Grace');
    expect(names()).toEqual(['Grace']);

    expect(press(document.body, UNDO)).toBe(true);
    expect(names()).toEqual(['Ada']);
  });

  it.each([
    ['Ctrl+Shift+Z', { key: 'Z', ctrlKey: true, shiftKey: true }],
    ['Cmd+Shift+Z', { key: 'Z', metaKey: true, shiftKey: true }],
    ['Cmd+Shift+Z reported as lowercase z', { key: 'z', metaKey: true, shiftKey: true }],
    ['Ctrl+Y', { key: 'y', ctrlKey: true }],
    ['Cmd+Y', { key: 'y', metaKey: true }],
  ])('%s redoes the last undone grid change', (_, redo) => {
    const { names, scope } = renderReview();
    editCell(scope(), 'Ada', 'Grace');
    press(document.body, UNDO);
    expect(names()).toEqual(['Ada']);

    expect(press(document.body, redo)).toBe(true);
    expect(names()).toEqual(['Grace']);
  });

  it('Ctrl+Z with Caps Lock on (uppercase Z, no Shift) still undoes', () => {
    const { names, scope } = renderReview();
    editCell(scope(), 'Ada', 'Grace');

    press(document.body, { key: 'Z', ctrlKey: true });
    expect(names()).toEqual(['Ada']);
  });

  it('works when focus is on a non-text element inside the wizard', () => {
    const { names, scope } = renderReview();
    editCell(scope(), 'Ada', 'Grace');
    const cell = scope().getByRole('gridcell', { name: 'Grace' });
    cell.focus();

    expect(press(cell, UNDO)).toBe(true);
    expect(names()).toEqual(['Ada']);
  });

  describe('while typing in a text field', () => {
    const textFields: [string, (scope: ReturnType<typeof within>) => HTMLElement][] = [
      ['the cell editor', (s) => {
        fireEvent.click(s.getByText('Grace'));
        return s.getByDisplayValue('Grace');
      }],
      ['the search box', (s) => s.getByPlaceholderText(/search in data/i)],
      ['the AI Edit prompt', (s) => {
        fireEvent.click(s.getByRole('button', { name: /ai edit/i }));
        return s.getByPlaceholderText(/describe how to edit/i);
      }],
      ['the find & replace dialog', (s) => {
        fireEvent.click(s.getByRole('button', { name: /find & replace/i }));
        return within(s.getByRole('dialog')).getByLabelText('Find');
      }],
    ];

    it.each(textFields)('%s keeps native undo/redo and leaves the grid alone', (_, focusField) => {
      const { names, scope } = renderReview();
      editCell(scope(), 'Ada', 'Grace');
      const field = focusField(scope());

      for (const shortcut of [
        UNDO,
        { key: 'Z', ctrlKey: true, shiftKey: true },
        { key: 'y', ctrlKey: true },
      ]) {
        expect(press(field, shortcut)).toBe(false);
      }
      expect(names()).toEqual(['Grace']);
    });
  });

  it('with two review steps on one page, only the one holding focus undoes', () => {
    const first = reviewStep('Ada');
    const second = reviewStep('Bob');
    render(
      <>
        {first.element}
        {second.element}
      </>
    );
    editCell(first.scope(), 'Ada', 'Grace');
    editCell(second.scope(), 'Bob', 'Linus');

    const cell = second.scope().getByRole('gridcell', { name: 'Linus' });
    cell.focus();
    press(cell, UNDO);

    expect(first.names()).toEqual(['Grace']);
    expect(second.names()).toEqual(['Bob']);
  });

  it('ignores the shortcut when focus is in the Host App page outside the wizard', () => {
    const { names, scope } = renderReview();
    editCell(scope(), 'Ada', 'Grace');
    const hostButton = document.createElement('button');
    document.body.appendChild(hostButton);
    hostButton.focus();

    expect(press(hostButton, UNDO)).toBe(false);
    expect(names()).toEqual(['Grace']);
    hostButton.remove();
  });
});
