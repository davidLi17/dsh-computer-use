---
name: windows-computer-use
description: Operate Windows desktop apps with computer-use tools; context, capabilities and essential constraints.
---

# Windows computer use

Complete the user's task in their chosen app with grounded actions and minimal disruption. Choose the actions, batching and verification that fit the task; no fixed sequence is required. This Windows-only skill supplies operating context, not permission. Never bypass denied access.

## Available capabilities

- open_application opens or focuses apps, restores tray apps, and returns a screenshot plus saved app notes. Use those notes as context; they may need correction.
- computer provides screenshots, mouse/keyboard input, waiting and zoom. computer_batch runs ordered actions without intermediate observations and stops on failure or user takeover. Its finish option selects screenshot, accessible text or no capture; zoom is allowed only as the last action.
- ui_elements exposes controls or, with text: true, readable window text. Some apps expose neither, so screenshots remain necessary. windows manages windows; switch_display selects the monitor.
- app_skill keeps reusable operating knowledge across sessions, separate from this bundled skill. Preserve shortcuts, quirks and useful discoveries, not task content, personal data, credentials or coordinates. Respect its reported size limit.

## Essential contracts

- Coordinates refer to the current full screenshot, never guessed positions. The plugin handles DPI, scaling and monitor offsets. A zoom image is only a detail view: its pixels are NOT action coordinates. Refresh observations when window or display geometry changes.
- target identifies a named control; wait with until can synchronize on a window or control. These support predictable mid-batch transitions. If a later decision needs an intermediate result, observe it before continuing.
- Actions normally return a settled screenshot, so an extra wait/capture is often redundant. Auto-screenshot can be disabled and unchanged images can be omitted; use the actual result to judge whether observation is sufficient.
- For requested in-app writing, use computer type, including long text. It handles visible entry and the clipboard; shell-written files and Set-Clipboard/clip bypass that behavior.
- Tray apps are still running. Use open_application to restore them; another instance requires the user's explicit request (new_instance: true). Do not show or kill hidden windows through a shell: Electron/Qt apps can freeze or trigger another login.
- Leave the requested result available and preserve the user's pre-existing windows. windows tidy re-minimizes apps that began minimized or in the tray; close only unneeded windows/dialogs opened for this task.

## Read only when needed

- Saving or Save As: [Saving files](references/saving.md).
- Failed controls, loading, missing text or interrupted actions: [Troubleshooting](references/troubleshooting.md).
