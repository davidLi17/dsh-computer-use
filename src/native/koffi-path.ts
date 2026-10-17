/**
 * Finds the koffi.node that DSH ships. It is signed by DeepSeek, so Smart App
 * Control lets it load where our own compiled cu-helper.exe is refused; a koffi
 * installed from npm would be unsigned and no better than the exe.
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const RELATIVE = join('app.asar.unpacked', 'dsh', 'node_modules', '@koromix', 'koffi-win32-x64', 'win32_x64', 'koffi.node')

const IN_NODE_MODULES = join('node_modules', '@koromix', 'koffi-win32-x64', 'win32_x64', 'koffi.node')

/** node_modules/@koromix/... in the folders above the host's entry script, nearest first. */
function besideHost(script: string | undefined): string[] {
  if (!script) return []
  const found: string[] = []
  for (let dir = dirname(script); ; dir = dirname(dir)) {
    found.push(join(dir, IN_NODE_MODULES))
    if (dirname(dir) === dir) return found
  }
}

export function koffiCandidates(env: NodeJS.ProcessEnv = process.env, script = process.argv[1]): string[] {
  const resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  return [
    env.DSH_KOFFI_PATH,
    resources && join(resources, RELATIVE),
    // The desktop host runs as "DeepSeek Harness.exe" with ELECTRON_RUN_AS_NODE: no resourcesPath then.
    join(dirname(process.execPath), 'resources', RELATIVE),
    env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Programs', 'DeepSeek Harness', 'resources', RELATIVE),
    // The npm-installed CLI (node …/@deepseek-ai/dsh/lib/bin.js) has the same koffi in its own
    // node_modules. That copy is not signed, but the host loads it itself, so it is no worse off.
    ...besideHost(script),
  ].filter((path): path is string => Boolean(path))
}

export function findKoffi(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return koffiCandidates(env).find(path => existsSync(path))
}
