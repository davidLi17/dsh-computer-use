import { execFileSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { SkillRegistry, renderSkillContent } from '@deepseek-ai/dsh-skill'
import * as FileSystemSkills from '@deepseek-ai/dsh-skill-filesystem'
import { parse } from 'yaml'
import { afterEach, describe, expect, it, vi } from 'vitest'

const sourceRoot = fileURLToPath(new URL('../', import.meta.url))
const temporaryRoots: string[] = []

interface JavaScriptExpression {
  javascript: string
}

interface PatchEntry {
  id: string
  name: string | JavaScriptExpression
  config: Omit<FileSystemSkills.Config, 'bundledSkillDir'> & { bundledSkillDir: JavaScriptExpression }
}

/** Keep !!js unevaluated until the test supplies the installed profile anchor. */
async function readProviderEntry(): Promise<PatchEntry> {
  const patch = parse(await readFile(join(sourceRoot, 'cordis.patch.yml'), 'utf8'), {
    customTags: [{
      tag: 'tag:yaml.org,2002:js',
      resolve: (javascript: string): JavaScriptExpression => ({ javascript }),
    }],
  }) as { insert?: PatchEntry[] }[]
  const entry = patch.flatMap(operation => operation.insert ?? [])
    .find(item => item.id === 'copylee-computer-use-skills')
  expect(entry, 'the published patch must mount the bundled provider').toBeDefined()
  return entry!
}

async function installedFixture() {
  const root = await mkdtemp(join(tmpdir(), 'cu-bundled-skill-'))
  temporaryRoots.push(root)
  const installation = join(root, 'installation')
  const packageRoot = join(installation, 'node_modules', '@copylee', 'dsh-computer-use')
  const cwd = join(root, 'unrelated-workspace')
  await mkdir(packageRoot, { recursive: true })
  await mkdir(cwd, { recursive: true })
  await cp(join(sourceRoot, 'package.json'), join(packageRoot, 'package.json'))
  await cp(join(sourceRoot, 'skills'), join(packageRoot, 'skills'), { recursive: true })
  return {
    root,
    packageRoot,
    cwd,
    baseUrl: pathToFileURL(join(installation, 'profile.mjs')).href,
  }
}

/** A separate process proves that process.cwd() is not the package anchor. */
function resolveInstalledRoot(expression: JavaScriptExpression, baseUrl: string, cwd: string): string {
  expect(typeof expression.javascript).toBe('string')
  const script = `
    const baseUrl = ${JSON.stringify(baseUrl)};
    const root = (${expression.javascript});
    process.stdout.write(JSON.stringify({ root, cwd: process.cwd() }));
  `
  const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd,
    encoding: 'utf8',
  })) as { root: string; cwd: string }
  expect(result.cwd).toBe(cwd)
  return result.root
}

async function addDecoy(root: string, name: string) {
  await mkdir(join(root, name), { recursive: true })
  await writeFile(join(root, name, 'SKILL.md'), `---\nname: ${name}\ndescription: Must not be discovered by the bundled provider.\n---\nDecoy body.\n`)
}

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('bundled DSH computer-use skill', () => {
  it('resolves the actual patch root from an installed package, not cwd', async () => {
    const entry = await readProviderEntry()
    const fixture = await installedFixture()
    expect(entry.config).toMatchObject({
      providerName: 'copylee-computer-use',
      includeDefaultRoots: false,
      watch: false,
    })
    const root = resolveInstalledRoot(entry.config.bundledSkillDir, fixture.baseUrl, fixture.cwd)
    expect(isAbsolute(root)).toBe(true)
    expect(root).toBe(join(fixture.packageRoot, 'skills'))
    expect(root).not.toContain(fixture.cwd)
    const secondCwd = join(fixture.root, 'another-workspace')
    await mkdir(secondCwd)
    expect(resolveInstalledRoot(entry.config.bundledSkillDir, fixture.baseUrl, secondCwd)).toBe(root)
  })

  it('discovers and loads only bundled skills through the real host registry and provider', async () => {
    const entry = await readProviderEntry()
    const fixture = await installedFixture()
    const bundledSkillDir = resolveInstalledRoot(entry.config.bundledSkillDir, fixture.baseUrl, fixture.cwd)
    const dshHome = join(fixture.root, 'dsh-home')
    const agentsHome = join(fixture.root, 'agents-home')
    const environmentRoot = join(fixture.root, 'environment-skills')
    await Promise.all([
      addDecoy(join(fixture.cwd, '.dsh', 'skills'), 'project-dsh-decoy'),
      addDecoy(join(fixture.cwd, '.agents', 'skills'), 'project-agents-decoy'),
      addDecoy(join(dshHome, 'skills'), 'user-dsh-decoy'),
      addDecoy(join(agentsHome, 'skills'), 'user-agents-decoy'),
      addDecoy(environmentRoot, 'environment-decoy'),
    ])
    vi.stubEnv('DSH_BUNDLED_SKILL_DIR', environmentRoot)

    const ctx = new Context()
    const registry = await ctx.plugin(SkillRegistry)
    const provider = await ctx.plugin(FileSystemSkills, {
      ...entry.config,
      bundledSkillDir,
      dshHome,
      agentsHome,
    })
    try {
      const catalog = await ctx.skills.snapshot({ cwd: fixture.cwd })
      expect(catalog.complete).toBe(true)
      expect(catalog.skills.map(skill => skill.name)).toEqual(['windows-computer-use'])
      expect(catalog.skills[0]).toMatchObject({
        provider: 'copylee-computer-use',
        source: 'bundled',
        invocation: { modelInvocable: true, userInvocable: true },
        path: join(bundledSkillDir, 'windows-computer-use', 'SKILL.md'),
      })

      const skill = await ctx.skills.get('windows-computer-use', { cwd: fixture.cwd })
      expect(skill).toBeDefined()
      expect(skill!.content).toContain('computer_batch')
      expect(skill!.content).toContain('app_skill')
      expect(skill!.resourceBase).toEqual({
        kind: 'directory',
        path: join(bundledSkillDir, 'windows-computer-use'),
      })

      // This is the host's model-facing resource hint, not a fabricated cwd path.
      const rendered = renderSkillContent(skill!)
      expect(rendered).toContain(`Base directory for this skill: ${dirname(skill!.path!)}`)
      expect(rendered).toContain('Resolve relative paths mentioned by this skill against the base directory')
      const base = skill!.resourceBase!
      expect(base.kind).toBe('directory')
      if (base.kind !== 'directory') throw new Error('Filesystem skill lacks a directory resource base')
      const references = [...skill!.content.matchAll(/\]\((references\/[^)]+\.md)\)/g)]
        .map(match => match[1]!)
      expect(references.sort()).toEqual(['references/saving.md', 'references/troubleshooting.md'])
      for (const reference of references) {
        const text = await readFile(join(base.path, reference), 'utf8')
        expect(text.length).toBeGreaterThan(100)
        expect(text).toBe(await readFile(join(sourceRoot, 'skills', 'windows-computer-use', reference), 'utf8'))
      }
      expect(await ctx.skills.get('project-dsh-decoy', { cwd: fixture.cwd })).toBeUndefined()
    } finally {
      await provider.dispose()
      await registry.dispose()
    }
  })
})
