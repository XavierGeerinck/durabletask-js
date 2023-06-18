import { NonDeterminismError } from "../task/exception/non-determinism-error";
import * as pb from "../proto/orchestrator_service_pb";
import { getName } from "../task";
import { OrchestrationContext } from "../task/context/orchestration-context";


export function getNonDeterminismError(taskId: number, actionName: string): NonDeterminismError {
    return new NonDeterminismError(`A previous execution called ${actionName} with ID=${taskId} but the current execution doesn't have this action with this ID. This problem occurs when either the orchestration has non-deterministic logic or if the code was changed after an instance of this orchestration already started running`);
}

export function getWrongActionTypeError(taskId: number, expectedMethodName: string, action: pb.OrchestratorAction): NonDeterminismError {
    const unexpectedMethodName = getMethodNameForAction(action);

    return new NonDeterminismError(`Failed to restore orchestration state due to a history mismatch: A previous execution called ${expectedMethodName} with ID=${taskId}, but the current execution is instead trying to call ${unexpectedMethodName} as part of rebuilting it's history. This kind of mismatch can happen if an orchestration has non-deterministic logic or if the code was changed after an instance of this orchestration already started running.`);
}

export function getWrongActionNameError(taskId: number, methodName: string, expectedTaskName?: string, actualTaskName?: string): NonDeterminismError {
    return new NonDeterminismError(`Failed to restore orchestration state due to a history mismatch: A previous execution called ${methodName} with name=${expectedTaskName} and sequence number ${taskId}, but the current execution is instead trying to call ${actualTaskName} as part of rebuilting it's history. This kind of mismatch can happen if an orchestration has non-deterministic logic or if the code was changed after an instance of this orchestration already started running.`);
}

export function getMethodNameForAction(action: pb.OrchestratorAction): string {
    const actionType = action.getOrchestratoractiontypeCase();

    switch (actionType) {
        case pb.OrchestratorAction.OrchestratoractiontypeCase.SCHEDULETASK:
            return getName(OrchestrationContext.prototype.callActivity);
        case pb.OrchestratorAction.OrchestratoractiontypeCase.CREATETIMER:
            return getName(OrchestrationContext.prototype.createTimer);
        case pb.OrchestratorAction.OrchestratoractiontypeCase.CREATESUBORCHESTRATION:
            return getName(OrchestrationContext.prototype.callSubOrchestrator);
        default:
            throw new Error(`Unknown action type: ${actionType}`);
    }
}

export function getNewEventSummary(newEvents: pb.HistoryEvent[]): string {
    if (!newEvents?.length) {
        return "[]";
    } else if (newEvents.length == 1) {
        return `[${newEvents[0].getEventtypeCase()}]`;
    } else {
        let counts = new Map<string, number>();

        for (const event of newEvents) {
            const eventType = event.getEventtypeCase().toString();
            const count = counts.get(eventType) ?? 0;
            counts.set(eventType, count + 1);
        }

        return `[${Array.from(counts.entries()).map(([name, count]) => `${name}=${count}`).join(", ")}]`;
    }
}

/**
 * Returns a summary of the new actions that can be used for logging
 * @param newActions 
 */
export function getActionSummary(newActions: pb.OrchestratorAction[]): string {
    if (!newActions?.length) {
        return "[]";
    } else if (newActions.length == 1) {
        return `${newActions[0].getOrchestratoractiontypeCase()}`;
    } else {
        let counts = new Map<string, number>();

        for (const action of newActions) {
            const actionType = action.getOrchestratoractiontypeCase().toString();
            const count = counts.get(actionType) ?? 0;
            counts.set(actionType, count + 1);
        }

        return `[${Array.from(counts.entries()).map(([name, count]) => `${name}=${count}`).join(", ")}]`;
    }
}

/**
 * Returns true of the event is one that can be suspended and resumed
 * @param event 
 */
export function isSuspendable(event: pb.HistoryEvent): boolean {
    return ["executionResumed", "executionTerminated"].indexOf(event.getEventtypeCase().toString()) == -1;
}