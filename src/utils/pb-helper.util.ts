import * as pb from "../proto/orchestrator_service_pb";

export function newFailureDetails(e: any): pb.TaskFailureDetails {
  const failure = new pb.TaskFailureDetails();
  failure.setErrortype(e.constructor.name);
  failure.setErrormessage(e.message);
  failure.setStacktrace(e.stack);
  return failure;
}

export function newCompleteOrchestrationAction(
  id: number,
  status: pb.OrchestrationStatus,
  result?: any,
  failure?: pb.TaskFailureDetails,
): pb.OrchestratorAction {
  const action = new pb.CompleteOrchestrationAction();

  action.setOrchestrationstatus(status);
  action.setResult(result);

  if (failure) {
    action.setFailuredetails(failure);
  }

  const orchestratorAction = new pb.OrchestratorAction();
  orchestratorAction.setId(id);
  orchestratorAction.setCompleteorchestration(action);

  return orchestratorAction;
}
