import {setTimeout as delay} from 'node:timers/promises'
import fs from 'node:fs/promises'

import {NetrcHandler} from '../../src/credential-handlers/netrc-handler.js'

const [operation, netrcPath, host, startAtValue, saveAtValue, startedMarker, loadedMarker] = process.argv.slice(2)
const startAt = Number(startAtValue)
const saveAt = Number(saveAtValue)
const handler = new NetrcHandler(netrcPath)
const save = handler.netrc.save.bind(handler.netrc)
const load = handler.netrc.load.bind(handler.netrc)

function reportActiveResources(stage) {
  if (process.env.NETRC_WORKER_DIAGNOSTICS !== '1') return
  const handles = process._getActiveHandles().map(handle => handle.constructor.name)
  process.stderr.write(`${JSON.stringify({handles, resources: process.getActiveResourcesInfo(), stage})}\n`)
}

handler.netrc.save = async () => {
  await delay(Math.max(0, saveAt - Date.now()))
  reportActiveResources('lock-held')
  await save()
}

handler.netrc.load = async () => {
  await load()
  if (loadedMarker) await fs.writeFile(loadedMarker, '')
}

await delay(Math.max(0, startAt - Date.now()))
if (startedMarker) await fs.writeFile(startedMarker, '')
if (operation === 'save') {
  await handler.saveAuth({login: `${host}@example.com`, password: `${host}-token`}, host)
} else if (operation === 'remove') {
  await handler.removeAuth(host)
} else {
  throw new Error(`Unsupported netrc worker operation: ${operation}`)
}

reportActiveResources('released')
