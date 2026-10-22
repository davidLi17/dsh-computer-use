/** Short always-on guidance. Long procedures are loaded through the bundled DSH skill. */
import type { AccessMode } from './access.js'

export function promptText(mode: AccessMode): string {
  const access = mode === 'per-app'
    ? '- Before input, request_access once for all apps this task needs; wait for approval. Ungranted apps are refused.\n'
    : '- App access is allow-all; blocked apps and DeepSeek Harness remain protected.\n'
  return `# Computer use (Windows)
- Before desktop actions, read the DSH skill windows-computer-use; load its saving/troubleshooting references only when needed. If unavailable, stop and report it.
${access}- Use open_application to open/switch apps and read its saved app notes; otherwise observe the screen first. Act from current observations, not guessed coordinates.
- Respect user takeover, pause and stop: Esc pauses; wait during user input/window changes. If an action was not performed or a batch stopped, re-observe before continuing, never blindly retry.
- Let the user enter passwords, payment details, verification codes and CAPTCHAs. Sending, deleting and purchasing require clear user authorization.
- The DSH floating card is hidden in screenshots; clicks/scrolls pass through it. Never type into DeepSeek Harness: keys go to the working app.`
}
