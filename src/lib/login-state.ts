import debug from 'debug'
import * as fs from 'node:fs'
import {join} from 'node:path'

const credDebug = debug('heroku-credential-manager')

const LOGIN_STATE_FILE = 'login.json'

type LoginState = {
  account: string
}

export async function readLoginState(dataDir: string): Promise<LoginState | undefined> {
  const filePath = join(dataDir, LOGIN_STATE_FILE)

  try {
    const content = await fs.promises.readFile(filePath, 'utf8')
    const parsed = JSON.parse(content)

    if (typeof parsed?.account === 'string' && parsed.account.length > 0) {
      return {account: parsed.account}
    }

    credDebug('login state file missing valid account field: %s', filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      credDebug('failed to read login state file: %s', (error as Error).message)
    }
  }
}

export async function writeLoginState(dataDir: string, account: string): Promise<void> {
  const filePath = join(dataDir, LOGIN_STATE_FILE)
  const content = JSON.stringify({account}) + '\n'

  await fs.promises.mkdir(dataDir, {mode: 0o700, recursive: true})

  if (process.platform === 'win32') {
    await fs.promises.writeFile(filePath, content, {encoding: 'utf8', mode: 0o600})
    return
  }

  const directoryHandle = await fs.promises.open(
    dataDir,
    // eslint-disable-next-line no-bitwise
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
  )
  try {
    await directoryHandle.chmod(0o700)
  } finally {
    await directoryHandle.close()
  }

  const fileHandle = await fs.promises.open(
    filePath,
    // eslint-disable-next-line no-bitwise
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW,
    0o600,
  )
  try {
    await fileHandle.chmod(0o600)
    await fileHandle.truncate(0)
    await fileHandle.writeFile(content, {encoding: 'utf8'})
  } finally {
    await fileHandle.close()
  }
}

export async function deleteLoginState(dataDir: string): Promise<void> {
  const filePath = join(dataDir, LOGIN_STATE_FILE)

  try {
    await fs.promises.unlink(filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      credDebug('failed to delete login state file: %s', (error as Error).message)
    }
  }
}
