import { FailureDetails } from "../task/failure-details";
import { OrchestrationStatus } from "./enum/orchestration-status.enum";
import { OrchestrationFailedError } from "./exception/orchestration-failed-error";

export class OrchestrationState {
  instanceId: string;
  name: string;
  runtimeStatus: OrchestrationStatus;
  createdAt: Date;
  lastUpdatedAt: Date;
  serializedInput?: string;
  serializedOutput?: string;
  serializedCustomStatus?: string;
  failureDetails?: FailureDetails;

  constructor(
    instanceId: string,
    name: string,
    runtimeStatus: OrchestrationStatus,
    createdAt: Date,
    lastUpdatedAt: Date,
    serializedInput?: string,
    serializedOutput?: string,
    serializedCustomStatus?: string,
    failureDetails?: FailureDetails,
  ) {
    this.instanceId = instanceId;
    this.name = name;
    this.runtimeStatus = runtimeStatus;
    this.createdAt = createdAt;
    this.lastUpdatedAt = lastUpdatedAt;
    this.serializedInput = serializedInput;
    this.serializedOutput = serializedOutput;
    this.serializedCustomStatus = serializedCustomStatus;
    this.failureDetails = failureDetails;
  }

  raiseIfFailed(): void {
    if (this.failureDetails) {
      throw new OrchestrationFailedError(
        `Orchestration '${this.instanceId}' failed: ${this.failureDetails.message}`,
        this.failureDetails,
      );
    }
  }
}
