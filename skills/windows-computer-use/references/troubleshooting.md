# Troubleshooting desktop actions

- Access refused: in per-app mode request_access for the task's required apps before input. In allow-all mode do not invent an approval step; blocked apps and DeepSeek Harness remain protected in either mode. Never bypass a denial through another tool or shell.
- User takeover: Esc pauses control; keyboard input or a window switch can interrupt a batch. Wait while the user is in control and respect any stop request. When an action says not performed/skipped, or a batch stops partway, inspect its result and re-observe the screen. Do not repeat completed steps or blindly retry uncertain actions.
- Wrong or absent target: inspect ui_elements and the current screenshot, check the active window, and use an unambiguous visible label/type or current coordinates. Maximize a small target window or minimize an obstruction. Do not continue a batch based on stale geometry.
- DPI and multiple monitors: coordinates belong to the latest returned screenshot, including any zoom. Do not manually apply DPI factors or assume monitor origins are zero. Re-observe after a window or display change.
- Loading: actions already return a settled screenshot. If content is still loading, use wait (prefer until for the expected window/target); its result is also a screenshot. Avoid redundant screenshots.
- No accessible text: ui_elements text or finish: text may report no readable text. Use a screenshot and one generous zoom when necessary; scroll to reveal more, rather than repeatedly zooming.
- Tray apps: open_application restores running tray apps. Do not launch another instance without explicit request (new_instance: true), kill hidden windows or force them visible through a shell.
- DSH floating card: screenshots omit it, and clicks/scrolls pass through it to the underlying app. Never type into DeepSeek Harness; keys go to the working window. This is not a screenshot defect.
- Passwords, payment details, verification codes and CAPTCHAs: stop and let the user complete that step. Do not store them in app notes. Sending, deleting or purchasing still requires the user's authorization.
- Finish cleanly: close only dialogs/windows opened for this task that are no longer needed, retain the requested result, then windows tidy restores apps previously minimized or in the tray. Never close the user's pre-existing windows.
