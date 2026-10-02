export interface MintChoice {
  url: string;
  label: string;
}

/**
 * The mint the player picked for the upcoming run. Deliberately in-memory only:
 * the selection resets to the default on reload (see the title screen), but has
 * to survive the trip from the mint picker back to the title screen.
 */
let selected: MintChoice | null = null;

export function getSelectedMint(): MintChoice | null {
  return selected;
}

export function setSelectedMint(choice: MintChoice | null): void {
  selected = choice;
}

/** Label for the title screen: the chosen mint, or the default. */
export function selectedMintLabel(): string {
  return selected?.label ?? 'Minibits (default)';
}

export function selectedMintUrl(): string | undefined {
  return selected?.url;
}
