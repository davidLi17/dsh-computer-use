import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Context } from '@deepseek-ai/cordis'
import { ToolsService } from '@deepseek-ai/dsh-tools'
import { describe, expect, it, vi } from 'vitest'
import { apply } from '../src/index.js'
import { createTools, type ToolHost } from '../src/tools.js'

const require = createRequire(import.meta.url)
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

describe('official DSH 0.2.2-rc.1 contracts', () => {
  it('tests against the declared rc1 host packages, not stale installed types', () => {
    for (const [name, version] of Object.entries(pkg.devDependencies)) {
      if (!name.startsWith('@deepseek-ai/dsh-')) continue
      expect(version).toBe('0.2.2-rc.1')
      expect(require(`${name}/package.json`).version).toBe(version)
    }
    expect(pkg.peerDependencies['@deepseek-ai/dsh-skill-filesystem'].split(' || '))
      .toContain('^0.2.2-rc.1')
  })

  it('accepts all computer tools in the real rc1 tool registry and removes them on disposal', async () => {
    const ctx = new Context()
    // Only the prompt sink is inert: tool validation/registration/schema projection
    // below use the official runtime, without starting native input or a model.
    ctx.provide('systemPrompt', { tools: () => () => {} })
    const registry = await ctx.plugin(ToolsService)
    const definitions = createTools({ computer: {}, skills: {} } as ToolHost)
    const disposers: (() => void)[] = []
    try {
      for (const definition of definitions) disposers.push(ctx.tools.register(definition))
      expect(ctx.tools.schemas().map(tool => tool.name)).toEqual(definitions.map(tool => tool.name))
      for (const definition of definitions) {
        expect(ctx.tools.get(definition.name)?.parameters).toEqual(definition.parameters)
      }
      for (const dispose of disposers.splice(0)) dispose()
      expect(ctx.tools.schemas()).toEqual([])
    } finally {
      for (const dispose of disposers) dispose()
      await registry.dispose()
    }
  })

  it.skipIf(process.platform === 'win32')('fails closed on non-Windows without registering native tools', () => {
    const warn = vi.fn()
    // Any access beyond the warning fails: no helper or Windows input can start.
    apply({ logger: { warn } } as unknown as Context)
    expect(warn).toHaveBeenCalledWith('dsh-computer-use only supports Windows; no tools registered.')
  })
})
