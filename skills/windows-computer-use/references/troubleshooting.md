# Troubleshooting desktop actions

- Wrong or absent control: ui_elements and the screenshot reveal the active window, labels and obstruction. target can include a control type (for example, "按钮:保存") to distinguish duplicate names. Covered or small windows may need maximizing or an obstruction minimized.
- Loading: screen settling is bounded, not proof that a page or operation finished. wait with until observes an expected window/control; wait also returns a screenshot when enabled.
- Missing text: UI Automation may expose only labels or no text. Screenshots, zoom and scrolling provide visual evidence. A text result can be truncated; inspect its reported length before treating it as complete.
- Interrupted or uncertain action: batch results identify completed steps and the failed/skipped step. Re-observe after the user yields control; resume from established state rather than replaying completed or uncertain effects.
- Windows security boundary: elevated windows, UAC prompts and the lock screen may be inaccessible. Let the user handle them; do not elevate or bypass the restriction.
