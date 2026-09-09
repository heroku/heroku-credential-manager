export class NativeCredentialNotFoundError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'NativeCredentialNotFoundError'
  }
}
