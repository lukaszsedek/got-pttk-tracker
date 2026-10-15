/** Zapamiętywanie ustawień widoku w localStorage (bezpiecznie w trybie prywatnym). */
const KEY = "got.ui.v1";

export interface UiState {
  tab?: string;
  open?: boolean;
  showDone?: boolean;
  showTodo?: boolean;
  showTrack?: boolean;
  minPoints?: number;
  region?: string;
  listRegion?: string;
  listOnlyMapped?: boolean;
  listStatus?: string;
  listSort?: string;
  view?: { center: [number, number]; zoom: number };
}

export function loadUi(): UiState {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as UiState;
  } catch {
    return {};
  }
}

export function saveUi(patch: UiState) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadUi(), ...patch }));
  } catch {
    /* ignoruj */
  }
}
