export interface SettingsViewer {
  id: string;
  email: string | null;
  fullName: string | null;
  globalInstructions: string;
}

export interface MinimalSettingsViewer {
  id: string;
  email: string | null;
}

export type SettingsViewerResult =
  | { status: 'ready'; viewer: SettingsViewer }
  | {
      status: 'profile-unavailable';
      reason: 'timeout' | 'error';
      viewer: MinimalSettingsViewer;
    }
  | { status: 'profile-missing'; viewer: MinimalSettingsViewer };

export type SaveGlobalInstructionsResult =
  | { status: 'saved'; value: string }
  | { status: 'error' };

export type SignOutResult =
  | { status: 'error' };
