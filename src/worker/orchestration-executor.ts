import * as pb from "../proto/orchestrator_service_pb";
import { OrchestrationStateError } from "../task/exception/orchestration-state-error";
import { TOrchestrator } from "../types/orchestrator.type";
import { Registry } from "./registry";
import { RuntimeOrchestrationContext } from "./runtime-orchestration-context";

export class OrchestrationExecutor {
  _generator?: TOrchestrator;
  _registry: Registry;
  _isSuspended: boolean;
  _suspendedEvents: pb.HistoryEvent[];

  constructor(registry: Registry) {
    this._registry = registry;
    this._generator = undefined;
    this._isSuspended = false;
    this._suspendedEvents = [];
  }

  execute(instanceId: string, oldEvents: pb.HistoryEvent[], newEvents: pb.HistoryEvent[]): pb.OrchestratorAction[] {
    if (!newEvents?.length) {
      throw new OrchestrationStateError("The new history event list must have at least one event in it");
    }

    let ctx = new RuntimeOrchestrationContext(instanceId);

    try {
      // Rebuild the local state by replaying the history events into the orchestrator function
      console.info(`${instanceId}: Rebuilding local state with ${oldEvents.length} history event...`);
      ctx._isReplaying = true;

      for (const oldEvent of oldEvents) {
        this.processEvent(ctx, oldEvent);
      }

      // Get new actions by executing newly received events into the orchestrator function
      const summary = this._getNewEventSumamry(newEvents);
      console.info(`${instanceId}: Processing ${newEvents.length} new history event(s): ${summary}`);
      ctx._isReplaying = false;

      for (const newEvent of newEvents) {
        this.processEvent(ctx, newEvent);
      }
    } catch (e: any) {
      ctx.setFailed(e.message);
    }

    if (ctx._completionStatus) {
      console.log(`${instanceId}: Orchestration completed with status: ${ctx._completionStatus}`);
      completionStatusStr = pbh.getOrchestrationStatusStr(ctx._completionStatus);
    }

    const actions = ctx.getActions();
    return actions;
  }
}
