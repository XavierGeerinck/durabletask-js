export class ActivityNotRegisteredError extends Error {
  constructor(name: string) {
    super(`Activity '${name}' does not exist.`);
  }
}
