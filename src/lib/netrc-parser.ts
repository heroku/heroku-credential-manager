import {execa, execaSync} from 'execa'
import debug from 'debug'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type Token = MachineToken | {type: 'other', content: string}
export type MachineToken = {
  type: 'machine'
  pre?: string
  host: string
  internalWhitespace: string
  props: {[key: string]: {value: string, comment?: string}}
  comment?: string
}

export type Machines = {
  [key: string]: {
    login?: string
    password?: string
    account?: string
    [key: string]: string | undefined
  }
}

const netrcDebug = debug('netrc-parser')

// this is somewhat complicated but it takes the array of parsed tokens from parse()
// and it creates ES6 proxy objects to allow them to be easily modified by the consumer of this library
function proxify(tokens: Token[]): Machines {
  const proxifyProps = (t: MachineToken) => new Proxy(t.props as any as {[key: string]: string}, {
    get(_, key: string) {
      if (key === 'host') return t.host
      if (typeof key !== 'string') return t.props[key]
      const prop = t.props[key]
      if (!prop) return
      return prop.value
    },
    set(_, key: string, value: string) {
      if (key === 'host') {
        t.host = value
      } else if (!value) {
        delete t.props[key]
      } else {
        t.props[key] = t.props[key] || (t.props[key] = {value: ''})
        t.props[key].value = value
      }
      return true
    },
  })
  const machineTokens = tokens.filter((m): m is MachineToken => m.type === 'machine')
  const machines = machineTokens.map(proxifyProps)
  const getWhitespace = () => {
    if (!machineTokens.length) return ' '
    return machineTokens[machineTokens.length - 1].internalWhitespace
  }
  const obj: Machines = {}
  obj._tokens = tokens as any
  for (let m of machines) obj[m.host] = m
  return new Proxy(obj, {
    set(obj, host: string, props: {[key: string]: string}) {
      if (!props) {
        delete obj[host]
        const idx = tokens.findIndex(m => m.type === 'machine' && m.host === host)
        if (idx === -1) return true
        tokens.splice(idx, 1)
        return true
      }
      let machine = machines.find(m => m.host === host)
      if (!machine) {
        const token: MachineToken = {type: 'machine', host, internalWhitespace: getWhitespace(), props: {}}
        tokens.push(token)
        machine = proxifyProps(token)
        machines.push(machine)
        obj[host] = machine
      }
      for (let [k, v] of Object.entries(props)) {
        machine[k] = v
      }
      return true
    },
    deleteProperty(obj, host: string) {
      delete obj[host]
      const idx = tokens.findIndex(m => m.type === 'machine' && m.host === host)
      if (idx === -1) return true
      tokens.splice(idx, 1)
      return true
    },
    ownKeys() {
      return machines.map(m => m.host)
    },
  })
}

export function parse(body: string): Machines {
  const lines = body.split('\n')
  let pre: string[] = []
  let machines: MachineToken[] = []
  while (lines.length) {
    const line = lines.shift()!
    const match = line.match(/machine\s+((?:[^#\s]+[\s]*)+)(#.*)?$/)
    if (!match) {
      pre.push(line)
      continue
    }
    const [, body, comment] = match
    const machine: MachineToken = {
      type: 'machine',
      host: body.split(' ')[0],
      pre: pre.join('\n'),
      internalWhitespace: '\n  ',
      props: {},
      comment,
    }
    pre = []
    // do not read other machines with same host
    if (!machines.find(m => m.type === 'machine' && m.host === machine.host)) machines.push(machine)
    if (body.trim().includes(' ')) { // inline machine
      const [host, ...propStrings] = body.split(' ')
      for (let a = 0; a < propStrings.length; a += 2) {
        machine.props[propStrings[a]] = {value: propStrings[a + 1]}
      }
      machine.host = host
      machine.internalWhitespace = ' '
    } else { // multiline machine
      while (lines.length) {
        const line = lines.shift()!
        const match = line.match(/^(\s+)([\S]+)\s+([\S]+)(\s+#.*)?$/)
        if (!match) {
          lines.unshift(line)
          break
        }
        const [, ws, key, value, comment] = match
        machine.props[key] = {value, comment}
        machine.internalWhitespace = `\n${ws}`
      }
    }
  }
  return proxify([...machines, {type: 'other', content: pre.join('\n')}])
}

export class Netrc {
  file: string
  machines!: Machines

  constructor(file?: string) {
    this.file = file || this.defaultFile
  }

  async load() {
    try {
      netrcDebug('load', this.file)
      const decryptFile = async (): Promise<string> => {
        const {exitCode, stdout} = await execa('gpg', this.gpgDecryptArgs, {stdio: ['inherit', 'pipe', 'inherit'], reject: false})
        if (exitCode !== 0) throw new Error(`gpg exited with code ${exitCode}`)
        return stdout
      }

      let body: string
      if (path.extname(this.file) === '.gpg') {
        body = await decryptFile()
      } else {
        body = await new Promise<string>((resolve, reject) => {
          fs.readFile(this.file, {encoding: 'utf8'}, (err, data) => {
            if (err && err.code !== 'ENOENT') reject(err)
            debug('ENOENT')
            resolve(data || '')
          })
        })
      }
      this.machines = parse(body)
      netrcDebug('machines: %o', Object.keys(this.machines))
    } catch (err) {
      return this.throw(err)
    }
  }

  loadSync() {
    try {
      netrcDebug('loadSync', this.file)
      const decryptFile = (): string => {
        const {stdout, exitCode} = execaSync('gpg', this.gpgDecryptArgs, {stdio: ['inherit', 'pipe', 'inherit'], reject: false})
        if (exitCode !== 0) throw new Error(`gpg exited with code ${exitCode}`)
        return stdout
      }

      let body = ''
      if (path.extname(this.file) === '.gpg') {
        body = decryptFile()
      } else {
        try {
          body = fs.readFileSync(this.file, 'utf8')
        } catch (error: unknown) {
          if (error instanceof Error && 'code' in error &&error.code !== 'ENOENT') throw error
        }
      }

      this.machines = parse(body)
      netrcDebug('machines: %o', Object.keys(this.machines))
    } catch (err) {
      return this.throw(err)
    }
  }

  async save() {
    netrcDebug('save', this.file)
    let body = this.output
    if (this.file.endsWith('.gpg')) {
      const {stdout, exitCode} = await execa('gpg', this.gpgEncryptArgs, {input: body, stdio: ['pipe', 'pipe', 'inherit'], reject: false})
      if (exitCode !== 0) throw new Error(`gpg exited with code ${exitCode}`)
      body = stdout
    }
    return new Promise<void>((resolve, reject) => {
      fs.writeFile(this.file, body, {mode: 0o600}, err => (err ? reject(err) : resolve()))
    })
  }

  saveSync() {
    netrcDebug('saveSync', this.file)
    let body = this.output
    if (this.file.endsWith('.gpg')) {
      const {stdout, exitCode} = execaSync('gpg', this.gpgEncryptArgs, {input: body, stdio: ['pipe', 'pipe', 'inherit'], reject: false})
      if (exitCode !== 0) throw new Error(`gpg exited with code ${exitCode}`)
      body = stdout
    }
    fs.writeFileSync(this.file, body, {mode: 0o600})
  }

  private get output(): string {
    let output: string[] = []
    for (let t of this.machines._tokens as any as Token[]) {
      if (t.type === 'other') {
        output.push(t.content)
        continue
      }
      if (t.pre) output.push(t.pre + '\n')
      output.push(`machine ${t.host}`)
      const addProps = (t: MachineToken) => {
        const addProp = (k: string) => output.push(`${t.internalWhitespace}${k} ${t.props[k].value}${t.props[k].comment || ''}`)
        // do login/password first
        if (t.props.login) addProp('login')
        if (t.props.password) addProp('password')
        for (let k of Object.keys(t.props).filter(k => !['login', 'password'].includes(k))) {
          addProp(k)
        }
      }
      const addComment = (t: MachineToken) => t.comment && output.push(' ' + t.comment)
      if (t.internalWhitespace.includes('\n')) {
        addComment(t)
        addProps(t)
        output.push('\n')
      } else {
        addProps(t)
        addComment(t)
        output.push('\n')
      }
    }
    return output.join('')
  }

  private get defaultFile(): string {
    const home = (os.platform() === 'win32' &&
        (process.env.HOME ||
          (process.env.HOMEDRIVE && process.env.HOMEPATH && path.join(process.env.HOMEDRIVE!, process.env.HOMEPATH!)) ||
          process.env.USERPROFILE)) ||
      os.homedir() ||
      os.tmpdir()
    const file = path.join(home, os.platform() === 'win32' ? '_netrc' : '.netrc')
    const gpgFile = `${file}.gpg`
    return fs.existsSync(gpgFile) ? gpgFile : file
  }

  private get gpgDecryptArgs() {
    const args = ['--batch', '--quiet', '--decrypt', this.file]
    netrcDebug('running gpg with args %o', args)
    return args
  }

  private get gpgEncryptArgs() {
    const args = ['-a', '--batch', '--default-recipient-self', '-e']
    netrcDebug('running gpg with args %o', args)
    return args
  }

  private throw(err: unknown): never {
    const error = (err instanceof Error ? err : new Error(String(err))) as Error & {detail?: string}
    if (error.detail) error.detail += '\n'
    else error.detail = ''
    error.detail += `Error occurred during reading netrc file: ${this.file}`
    throw error
  }
}

export default new Netrc()
