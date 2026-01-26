import debug from 'debug'
import {execa, execaSync} from 'execa'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type Token = {content: string, type: 'other'} | MachineToken
export type MachineToken = {
  comment?: string
  host: string
  internalWhitespace: string
  pre?: string
  props: {[key: string]: {comment?: string, value: string}}
  type: 'machine'
}

export type Machines = {
  [key: string]: {
    [key: string]: string | undefined
    account?: string
    login?: string
    password?: string
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
      } else if (value) {
        t.props[key] = t.props[key] || (t.props[key] = {value: ''})
        t.props[key].value = value
      } else {
        delete t.props[key]
      }

      return true
    },
  })
  const machineTokens = tokens.filter((m): m is MachineToken => m.type === 'machine')
  const machines = machineTokens.map(t => proxifyProps(t))
  const getWhitespace = () => {
    if (machineTokens.length === 0) return ' '
    return machineTokens.at(-1)!.internalWhitespace
  }

  const obj: Machines = {}
  obj._tokens = tokens as any
  for (const m of machines) obj[m.host] = m
  return new Proxy(obj, {
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
        const token: MachineToken = {
          host, internalWhitespace: getWhitespace(), props: {}, type: 'machine',
        }
        tokens.push(token)
        machine = proxifyProps(token)
        machines.push(machine)
        obj[host] = machine
      }

      for (const [k, v] of Object.entries(props)) {
        machine[k] = v
      }

      return true
    },
  })
}

export function parse(body: string): Machines {
  const lines = body.split('\n')
  let pre: string[] = []
  const machines: MachineToken[] = []
  while (lines.length > 0) {
    const line = lines.shift()!
    const match = line.match(/machine\s+((?:[^\s#]+\s*)+)(#.*)?$/)
    if (!match) {
      pre.push(line)
      continue
    }

    const [, body, comment] = match
    const machine: MachineToken = {
      comment,
      host: body.split(' ')[0],
      internalWhitespace: '\n  ',
      pre: pre.join('\n'),
      props: {},
      type: 'machine',
    }
    pre = []
    // do not read other machines with same host
    if (!machines.some(m => m.type === 'machine' && m.host === machine.host)) machines.push(machine)
    if (body.trim().includes(' ')) { // inline machine
      const [host, ...propStrings] = body.split(' ')
      for (let a = 0; a < propStrings.length; a += 2) {
        machine.props[propStrings[a]] = {value: propStrings[a + 1]}
      }

      machine.host = host
      machine.internalWhitespace = ' '
    } else { // multiline machine
      while (lines.length > 0) {
        const line = lines.shift()!
        const match = line.match(/^(\s+)(\S+)\s+(\S+)(\s+#.*)?$/)
        if (!match) {
          lines.unshift(line)
          break
        }

        const [, ws, key, value, comment] = match
        machine.props[key] = {comment, value}
        machine.internalWhitespace = `\n${ws}`
      }
    }
  }

  return proxify([...machines, {content: pre.join('\n'), type: 'other'}])
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
        const {exitCode, stdout} = await execa('gpg', this.gpgDecryptArgs, {reject: false, stdio: ['inherit', 'pipe', 'inherit']})
        if (exitCode !== 0) throw new Error(`gpg exited with code ${exitCode}`)
        return stdout
      }

      const body = await (path.extname(this.file) === '.gpg' ? decryptFile() : new Promise<string>((resolve, reject) => {
        fs.readFile(this.file, {encoding: 'utf8'}, (err, data) => {
          if (err && err.code !== 'ENOENT') reject(err)
          debug('ENOENT')
          resolve(data || '')
        })
      }))
      this.machines = parse(body)
      netrcDebug('machines: %o', Object.keys(this.machines))
    } catch (error) {
      return this.throw(error)
    }
  }

  loadSync() {
    try {
      netrcDebug('loadSync', this.file)
      const decryptFile = (): string => {
        const {exitCode, stdout} = execaSync('gpg', this.gpgDecryptArgs, {reject: false, stdio: ['inherit', 'pipe', 'inherit']})
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
          if (error instanceof Error && 'code' in error && error.code !== 'ENOENT') throw error
        }
      }

      this.machines = parse(body)
      netrcDebug('machines: %o', Object.keys(this.machines))
    } catch (error) {
      return this.throw(error)
    }
  }

  async save() {
    netrcDebug('save', this.file)
    let body = this.output
    if (this.file.endsWith('.gpg')) {
      const {exitCode, stdout} = await execa('gpg', this.gpgEncryptArgs, {input: body, reject: false, stdio: ['pipe', 'pipe', 'inherit']})
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
      const {exitCode, stdout} = execaSync('gpg', this.gpgEncryptArgs, {input: body, reject: false, stdio: ['pipe', 'pipe', 'inherit']})
      if (exitCode !== 0) throw new Error(`gpg exited with code ${exitCode}`)
      body = stdout
    }

    fs.writeFileSync(this.file, body, {mode: 0o600})
  }

  private addCommentToOutput(t: MachineToken, output: string[]) {
    if (t.comment) output.push(' ' + t.comment)
  }

  private addPropsToOutput(t: MachineToken, output: string[]) {
    const addProp = (k: string) => output.push(`${t.internalWhitespace}${k} ${t.props[k].value}${t.props[k].comment || ''}`)
    // do login/password first
    if (t.props.login) addProp('login')
    if (t.props.password) addProp('password')
    for (const k of Object.keys(t.props).filter(k => !['login', 'password'].includes(k))) {
      addProp(k)
    }
  }

  private get defaultFile(): string {
    const home = (os.platform() === 'win32'
        && (process.env.HOME
          || (process.env.HOMEDRIVE && process.env.HOMEPATH && path.join(process.env.HOMEDRIVE!, process.env.HOMEPATH!))
          || process.env.USERPROFILE))
      || os.homedir()
      || os.tmpdir()
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

  private get output(): string {
    const output: string[] = []
    for (const t of this.machines._tokens as any as Token[]) {
      if (t.type === 'other') {
        output.push(t.content)
        continue
      }

      if (t.pre) output.push(t.pre + '\n')
      output.push(`machine ${t.host}`)
      if (t.internalWhitespace.includes('\n')) {
        this.addCommentToOutput(t, output)
        this.addPropsToOutput(t, output)
        output.push('\n')
      } else {
        this.addPropsToOutput(t, output)
        this.addCommentToOutput(t, output)
        output.push('\n')
      }
    }

    return output.join('')
  }

  private throw(err: unknown): never {
    const error = (err instanceof Error ? err : new Error(String(err))) as {detail?: string} & Error
    if (error.detail) error.detail += '\n'
    else error.detail = ''
    error.detail += `Error occurred during reading netrc file: ${this.file}`
    throw error
  }
}

export default new Netrc()
