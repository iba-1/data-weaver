/**
 * Driving the wizard's Commit the way an Importer would, for component tests.
 */

import { act, fireEvent, screen, waitFor } from '@testing-library/react';

/**
 * Press the import button and wait until Commit is over (the progress is
 * gone). `name` is the button's accessible name.
 */
export async function importRows(name: RegExp | string = /complete import/i) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
  await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
}

/**
 * Press the review's button on to Resolution (Output Shapes with Relationship
 * Fields) and wait until the lookup has answered and the import button shows.
 */
export async function continueToResolution(
  name: RegExp | string = /link related records/i,
  importName: RegExp | string = /complete import/i
) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
  await screen.findByRole('button', { name: importName });
}
