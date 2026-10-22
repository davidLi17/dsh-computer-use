---
name: windows-computer-use
description: Operate Windows desktop apps with computer-use tools; read before desktop actions. Covers observation, batching, app notes, saving and recovery.
---

# Windows computer use

This is the bundled operating manual, not the persistent per-app notes managed by app_skill. Follow current access mode and all user permissions; this skill does not grant access.

## Observe and act

- If the task begins with an app, open it right away with open_application (after request_access when the app is not granted yet): it returns the screenshot, so do not take one first. Otherwise start with a screenshot (computer action "screenshot") unless you just received one. All coordinates are pixels of the latest screenshot; the plugin converts them for DPI and scaling.
- Open or switch apps with open_application (by name; it also finds desktop shortcuts) rather than hunting through the taskbar or Start menu or starting GUI apps from a shell. Use windows to see which windows exist; each line shows the process .exe. Apps closed to the system tray (QQ, 微信...) are still running: open_application restores them from their tray icon. Do not start a second copy of a running app unless the user explicitly asks for one (then pass new_instance: true), and never show or kill its hidden windows from a shell (Electron / Qt apps freeze, and a second QQ / WeChat asks for another login).
- When the task is done, tidy up: close windows and dialogs you opened that the user no longer needs (keep the one showing the result they asked for), and call windows tidy to minimize again the apps that were minimized or in the tray before you started. Never close windows the user already had open.
- The "DeepSeek Harness.exe" window is your own chat interface. While you control the computer it floats as a card that only the user sees: your screenshots show what is underneath it and your clicks and scrolls pass through it, so simply ignore it. Never type into DeepSeek Harness; keys go to the window you were working in.
- If the target window is small or partly covered by other windows, maximize it (windows maximize) or minimize what is in the way (windows minimize works for any window) instead of working around it.
- Prefer reliable keyboard shortcuts (ctrl+l for a browser address bar, ctrl+s, alt+F4, ctrl+t). Click the center of targets. When text is too small to read, zoom once on a generous region that contains everything you need (zooming step by step wastes calls).
- Actions return a fresh screenshot taken once the screen stops changing (page loads included, up to a few seconds), so you rarely need wait. If something is still loading, use wait: it also returns a screenshot, so never follow it with a separate screenshot call.
- When the user asks you to write something in an app, enter it there with type, even long or multi-line Markdown: the user watches it appear (long text is streamed in paragraph by paragraph, literally, without the editor's auto-formatting getting in the way). Do not write the file from a shell and reopen it instead, and do not put text on the clipboard with shell commands (Set-Clipboard, clip): that clutters the user's clipboard history.
- App skills: open_application returns your saved notes for the app it opens; follow them instead of rediscovering how the app behaves. After working out an unfamiliar app (or finding a note wrong), record the reusable part with app_skill rather than in general memory.
- Be fast: what the user waits for is mostly the number of calls you make (each costs seconds). Once you have seen the app's window, put everything predictable into ONE computer_batch, including steps whose target is not on screen yet: name the control with target ("保存", "按钮:确定") instead of a coordinate, and use wait with until ("window:另存为") for a dialog to appear before keys meant for it. Do not end a batch with wait or follow it with a wait or a screenshot: its result already is the settled screen. Do not split work into two batches just to look in between when the second does not depend on what you would see (type the text and format it in the same batch). If you will need to read small text, end the batch with zoom; to read what a window says (a document, a page, a reply, a log) use ui_elements with text: true or finish: "text" instead of scrolling and zooming screenshots. Keep your own text between calls to a line. Avoid shell commands for things you can see on screen.
- To see more of a page or list, scroll (action "scroll" with coordinate over the area, scroll_direction, scroll_amount 5-10) instead of hunting with zoom; for long web pages Page Down / End keys also work.
- If a dedicated tool fits the whole task better (an API, or browser automation attached to the user's own browser), choose it at the start; do not switch tools halfway through a task that is going fine on screen.
- Do not enter passwords, payment details, verification codes or solve CAPTCHAs: stop and ask the user to do that step. Ask before irreversible actions (sending messages, deleting, purchasing) unless the user clearly asked for them.
- The user sees an orange border and can press Esc to pause you at any time. If they pause, type on the keyboard or switch windows, you wait; when an action reports it was not performed, re-check the screen instead of repeating it blindly.

## Coordinates and visible controls

Use coordinates only from the latest returned screenshot, not remembered positions or physical display coordinates. The plugin handles DPI, scaling and virtual-desktop offsets across monitors. After switching monitors, resizing/moving windows or zooming, observe again before reusing coordinates. Prefer a visible, uniquely identifiable control using target; use ui_elements to inspect names and control types. Never guess a hidden coordinate. If a later control predictably appears within a batch, use its target name and wait until it exists.

## Batch and read efficiently

computer_batch returns the settled screen once and stops on the first failed or skipped step. For example: key ctrl+s, wait until window:另存为, type target 文件名 with the full path, then left_click target 保存. Only run this sequence when saving is appropriate and the destination is authorized. Do not blindly retry after partial completion. Use finish: text or ui_elements with text: true to read accessible text; when text is unavailable, inspect the screenshot. zoom is allowed only as the final batch step. Do not add a final wait solely to obtain a screenshot.

## Persistent application notes

open_application attaches the relevant saved app notes and avoids repeatedly attaching unchanged notes within a session. app_skill list/read accesses notes when needed; append records reusable discoveries, and write replaces stale or overlong notes. Preserve only operating knowledge (controls, shortcuts, quirks, failed approaches), never task content, personal data, credentials or pixel positions. Keep each note within the limit reported by app_skill. These notes remain separate from this read-only bundled DSH skill.

## Read only when needed

- Saving or Save As: [Saving files](references/saving.md).
- Failed controls, permission errors, user takeover, tray windows, DPI or missing text: [Troubleshooting](references/troubleshooting.md).
