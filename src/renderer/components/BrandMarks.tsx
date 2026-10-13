// Vector renditions for identifying source and destination. See docs/BRANDING.md.
export function ClaudeMark() {
  return <svg className="claude-mark" viewBox="0 0 28 24" fill="currentColor" aria-hidden="true" shapeRendering="crispEdges">
    <path d="M6 3h16v3h3v10h-3v2H6v-2H3V6h3V3ZM0 8h3v6H0V8Zm25 0h3v6h-3V8ZM6 18h3v4H6v-4Zm5 0h3v3h-3v-3Zm4 0h3v3h-3v-3Zm5 0h3v4h-3v-4Z"/>
    <path d="M9 8h3v4H9V8Zm8 0h3v4h-3V8Z" fill="#231d19"/>
  </svg>;
}

export function CodexMark() {
  return <svg className="codex-mark" viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <defs><linearGradient id="codex-mark-fill" x1="32" y1="4" x2="32" y2="59" gradientUnits="userSpaceOnUse"><stop stopColor="#c4acff"/><stop offset=".5" stopColor="#6e8bff"/><stop offset="1" stopColor="#4438f4"/></linearGradient></defs>
    <path d="M20 12C22 3 35 1 42 8C54 5 63 17 58 28C65 40 59 51 48 53C45 64 29 65 21 57C8 60 1 47 6 37C-1 26 6 15 20 12Z" fill="url(#codex-mark-fill)" stroke="#98a3ff" strokeWidth=".8"/>
    <path d="m21 24 6 10-6 10M36 43h12" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
