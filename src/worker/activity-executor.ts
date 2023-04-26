import * as pb from "../proto/orchestrator_service_pb";
import { OrchestrationStateError } from "../task/exception/orchestration-state-error";
import { TOrchestrator } from "../types/orchestrator.type";
import { Registry } from "./registry";

export class OrchestrationExecutor {
  private _generator: TOrchestrator | null;
  private _registry: Registry;
  private _isSuspended: boolean;
  private _suspendedEvents: pb.HistoryEvent[];

  constructor(registry: Registry) {
    this._generator = null;
    this._registry = registry;
    this._isSuspended = false;
    this._suspendedEvents = [];
  }

  execute(instanceId: string, oldEvents: pb.HistoryEvent[], newEvents: pb.HistoryEvent[]): pb.OrchestratorAction[] {
    if (!newEvents.length) {
      throw new OrchestrationStateError("The new history events list must have at least one event in it.");
    }

    const ctx = new RuntimeOrchestrationContext(instanceId);

    try {
      // Rebuild the local state by executing all old events into the orchestrator function
      console.debug(`${instanceId}: Rebuilding local state with ${oldEvents.length} history events...`);
      ctx.isReplaying = true;

      for (const event of oldEvents) {
        this.processEvent(ctx, event);
      }

      // Get the new actions by executing newly received events into the orchestrator function
      ctx.isReplaying = false;

      for (const event of newEvents) {
        this.processEvent(ctx, event);

        if (ctx.isComplete) {
          break;
        }
      }
    } catch (e) {
      // Unhandled exceptions fail the orchestration
      ctx.setFailed(e);
    }

    if (ctx._completionStatus) {
      console.log(`${instanceId}: Orchestration completed with status: ${ctx._completionStatus}`);
      completionStatusStr = pbh.getOrchestrationStatusStr(ctx._completionStatus);
    }

    const actions = ctx.getActions();
    return actions;
  }
}
