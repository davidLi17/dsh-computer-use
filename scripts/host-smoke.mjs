/** Isolated official-host installation/bootstrap check. Does not emulate Windows. */
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const cli = process.env.DSH_CLI
const tarball = process.argv[2]
assert.ok(cli && tarball, 'Usage: DSH_CLI=/absolute/path/to/dsh/lib/bin.js node scripts/host-smoke.mjs package.tgz')
const expectedVersion = '0.2.2-rc.1'
assert.equal(execFileSync(process.execPath, [cli, '--version'], { encoding: 'utf8' }).trim(), expectedVersion)
const home = await mkdtemp(join(tmpdir(), 'dsh-computer-use-host-'))
const env = { ...process.env, DSH_HOME: home }
let server
let logs = ''
try {
  const installArgs = ['plugin', '--profile', 'web', 'add', `file:${resolve(tarball)}`, '--ignore-scripts']
  if (process.env.PNPM_STORE_DIR) installArgs.push('--store-dir', process.env.PNPM_STORE_DIR)
  execFileSync(process.execPath, [cli, ...installArgs], { env, stdio: 'pipe', timeout: 120_000 })
  const profile = JSON.parse(await readFile(join(home, 'profiles/web/package.json'), 'utf8'))
  assert.ok(profile.dsh.profile.bundles.includes('@copylee/dsh-computer-use'), 'CLI must register the bundle')
  const config = execFileSync(process.execPath, [cli, 'web', '--dump-config'], { env, encoding: 'utf8', timeout: 30_000 })
  assert.match(config, /id: copylee-computer-use-skills/)
  assert.match(config, /providerName: copylee-computer-use\s+includeDefaultRoots: false/)
  assert.ok(config.includes("resolve('@copylee/dsh-computer-use/package.json')"), 'Skill root must resolve from the installed package')
  server = spawn(process.execPath, [cli, 'web', '--port', '0', '--no-open'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', data => { logs += data })
  server.stderr.on('data', data => { logs += data })
  let url
  for (let i = 0; i < 240; i++) {
    url = logs.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/)?.[0]
    if (url) break
    assert.equal(server.exitCode, null, 'Host exited before readiness')
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert.ok(url, 'Host readiness timed out')
  const login = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) })
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  const target = new URL(login.headers.get('location') ?? '/', url)
  assert.equal(target.origin, new URL(url).origin)
  const response = await fetch(target, { headers: { cookie }, redirect: 'error', signal: AbortSignal.timeout(10_000) })
  assert.equal(response.status, 200)
  const html = await response.text()
  assert.ok(html.includes('@copylee/dsh-computer-use/client.js'), 'Host must include the plugin client in its bootstrap')
  assert.ok(html.includes('__ModuleLoader__'))
  const clientPath = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)]
    .map(match => match[1].replaceAll('&amp;', '&'))
    .find(path => path.includes('@copylee/dsh-computer-use/client.js'))
  assert.ok(clientPath, 'Host must emit a plugin resource URL')
  const client = await fetch(new URL(clientPath, target), { headers: { cookie }, signal: AbortSignal.timeout(10_000) })
  assert.equal(client.status, 200, 'Host must serve the built client')
  assert.match(await client.text(), /id: "@copylee\/dsh-computer-use"/)
  assert.doesNotMatch(logs, /(?:incompatible|skipping profile bundle).*copylee/i)
  console.log(JSON.stringify({ hostVersion: expectedVersion, bundleRegistered: true, bundledProviderComposed: true, httpStatus: 200, clientServed: true, platform: process.platform, nativeWindowsTested: false }))
} finally {
  if (server && server.exitCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve))
    server.kill('SIGTERM')
    const killTimer = setTimeout(() => server.kill('SIGKILL'), 5000)
    await exited
    clearTimeout(killTimer)
  }
  await rm(home, { recursive: true, force: true })
}
