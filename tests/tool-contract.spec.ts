import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTools, type ToolHost } from '../src/tools.js'

// Frozen public parameter/output contracts from e6272a6; descriptions alone may change.
function withoutDescriptions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutDescriptions)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'description').map(([key, v]) => [key, withoutDescriptions(v)]))
  return value
}

describe('unchanged computer-use tool contracts', () => {
  it('preserves every tool name, parameter and output schema', () => {
    const tools = createTools({ computer: {}, skills: {} } as ToolHost)
    const contracts = tools.map(tool => ({ name: tool.name, parameters: tool.parameters, output: tool.output.schema }))
    const hash = createHash('sha256').update(JSON.stringify(withoutDescriptions(contracts))).digest('hex')
    expect(hash).toBe('b3db514564a18e0d33f4927951d8bb3ccd93e0ed06146a587386acad18d2dd03')
  })
})
