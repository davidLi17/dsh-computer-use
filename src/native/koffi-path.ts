/**
 * Finds the koffi.node that DSH ships. It is signed by DeepSeek, so Smart App
 * Control lets it load where our own compiled cu-helper.exe is refused; a koffi
 * installed from npm would be unsigned and no better than the exe.
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const RELATIVE = join('app.asar.unpacked', 'dsh', 'node_modules', '@koromix', 'koffi-win32-x64', 'win32_x64', 'koffi.node')

export function koffiCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  return [
    env.DSH_KOFFI_PATH,
    resources && join(resources, RELATIVE),
    // The host runs as "DeepSeek Harness.exe" with ELECTRON_RUN_AS_NODE: no resourcesPath then.
    join(dirname(process.execPath), 'resources', RELATIVE),
    env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Programs', 'DeepSeek Harness', 'resources', RELATIVE),
  ].filter((path): path is string => Boolean(path))
}

export function findKoffi(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return koffiCandidates(env).find(path => existsSync(path))
}
