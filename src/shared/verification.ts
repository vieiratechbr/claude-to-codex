export interface VerificationCheck { key: string; label: string; status: 'passed'|'warning'|'failed'; detail: string }
export interface InstallationVerification {
  installationId: string; pluginId: string; recognized: boolean; enabled: boolean; checkedAt: string;
  checks: VerificationCheck[]; testPrompt?: string;
}
