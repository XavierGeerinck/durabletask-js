export class OrchestratorNotRegisteredError extends Error {
  constructor(name: string) {
    super(`Orchestrator '${name}' does not exist.`);
  }
}
