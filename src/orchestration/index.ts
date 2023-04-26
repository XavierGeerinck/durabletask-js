import * as pb from "../proto/orchestrator_service_pb";
import { FailureDetails } from "../task/failure-details";
import { OrchestrationStatus, parseGrpcValue } from "./enum/orchestration-status.enum";
import { OrchestrationState } from "./orchestration-state";

export function newOrchestrationState(
  instanceId: string,
  res?: pb.GetInstanceResponse,
): OrchestrationState | undefined {
  if (!res || !res.getExists()) {
    return;
  }

  let state = res.getOrchestrationstate();
  let failureDetails;

  if (
    state &&
    (state?.getFailuredetails()?.getErrormessage() != "" || state.getFailuredetails()?.getErrortype() != "")
  ) {
    failureDetails = new FailureDetails(
      state.getFailuredetails()?.getErrormessage() ?? "",
      state.getFailuredetails()?.getErrortype() ?? "",
      state.getFailuredetails()?.getStacktrace(),
    );
  }

  const status = OrchestrationStatus[state?.getOrchestrationstatus() ?? 0];

  return new OrchestrationState(
    instanceId,
    state?.getName() ?? "",
    parseGrpcValue(state?.getOrchestrationstatus() ?? 0),
    new Date(state?.getCreatedtimestamp()),
    new Date(state?.getLastupdatedtimestamp()),
    state?.getInput() ?? null,
    state?.getOutput() ?? null,
    state?.getCustomstatus() ?? null,
    failureDetails,
  );
}
