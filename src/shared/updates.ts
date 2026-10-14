export interface AppUpdate {
  status: 'available'|'current'|'unavailable'; installedVersion: string; checkedAt: string;
  latestVersion?: string; releaseUrl?: string; downloadUrl?: string; message: string;
}
