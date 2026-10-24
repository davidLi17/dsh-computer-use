/** Always-on entry point and safety boundaries; operating context lives in the bundled skill. */
import type { AccessMode } from './access.js'

export function promptText(mode: AccessMode): string {
  const access = mode === 'per-app'
    ? '- Before input to ungranted apps, request_access and wait for approval.\n'
    : '- App access is allow-all; blocked apps and DeepSeek Harness remain protected.\n'
  return `# Computer use (Windows)
- Read windows-computer-use before desktop actions; if unavailable, stop and report it.
${access}- Respect pause, stop and user takeover: Esc pauses; wait during user input/window changes. After skipped input or a stopped batch, re-observe; never blindly retry.
- Let the user enter passwords, payment details, verification codes and CAPTCHAs. Sending, deleting and purchasing require clear user authorization.
- The DSH floating card is hidden in screenshots; clicks/scrolls pass through it. Never type into DeepSeek Harness: keys go to the working app.`
}
