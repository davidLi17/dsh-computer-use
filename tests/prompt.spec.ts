import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { promptText } from '../src/prompt.js'

// Baseline: e6272a6, exact old promptText output lengths (JS UTF-16 code units).
const BEFORE = { 'per-app': 5577, 'allow-all': 5425 }
const skill = readFileSync(new URL('../skills/windows-computer-use/SKILL.md', import.meta.url), 'utf8')
const catalog = skill.match(/^name: (.+)$/m)![1]! + '\n' + skill.match(/^description: (.+)$/m)![1]!

describe('progressive desktop guidance', () => {
  it.each(['per-app', 'allow-all'] as const)('keeps %s resident guide plus catalog at least 70% smaller', mode => {
    expect(promptText(mode).length + catalog.length).toBeLessThanOrEqual(BEFORE[mode] * 0.3)
    expect(promptText(mode)).toContain('windows-computer-use')
    expect(promptText(mode)).not.toContain('{{')
  })
  it('only asks for app approval in per-app mode', () => {
    expect(promptText('per-app')).toContain('request_access')
    expect(promptText('allow-all')).not.toContain('request_access')
    expect(promptText('allow-all')).toContain('blocked apps')
  })
  it('retains safety, user takeover and floating-card warnings', () => {
    for (const mode of ['per-app', 'allow-all'] as const) {
      const prompt = promptText(mode)
      for (const text of ['stop', 'Esc', 're-observe', 'passwords', 'payment details', 'verification codes', 'CAPTCHAs', 'Sending, deleting and purchasing', 'pass through', 'Never type into DeepSeek Harness']) expect(prompt).toContain(text)
    }
  })
  it('keeps detailed procedures out of the resident guide', () => {
    expect(skill).toContain('computer_batch')
    expect(skill).toContain('ui_elements')
    expect(skill).toContain('DPI')
    for (const ref of ['saving', 'troubleshooting']) {
      expect(skill).toContain(`references/${ref}.md`)
      expect(readFileSync(new URL(`../skills/windows-computer-use/references/${ref}.md`, import.meta.url), 'utf8').length).toBeGreaterThan(500)
    }
  })
})
