import { StringValue } from "google-protobuf/google/protobuf/wrappers_pb";
import { Timestamp } from "google-protobuf/google/protobuf/timestamp_pb";
import * as pb from "./proto/orchestrator_service_pb";
import * as stubs from "./proto/orchestrator_service_grpc_pb";
import { TOrchestrator } from "./types/orchestrator.type";
import { TInput } from "./types/input.type";
import { TOutput } from "./types/output.type";
import { getName } from "./task";
import { randomUUID } from "crypto";
import { promisify } from "util";
import { newOrchestrationState } from "./orchestration";
import { OrchestrationState } from "./orchestration/orchestration-state";
import { GrpcClient } from "./client-grpc";

export class TaskHubGrpcClient {
  private _stub: stubs.TaskHubSidecarServiceClient;

  constructor(hostAddress: string) {
    this._stub = new GrpcClient(hostAddress).stub;
  }

  async scheduleNewOrchestration(
    orchestrator: TOrchestrator,
    input?: TInput,
    instanceId?: string,
    startAt?: Date,
  ): Promise<string> {
    const name = getName(orchestrator);

    const req = new pb.CreateInstanceRequest();
    req.setName(name);
    req.setInstanceid(instanceId ?? randomUUID());

    const i = new StringValue();
    i.setValue(JSON.stringify(input));

    const ts = new Timestamp();
    ts.fromDate(new Date(startAt?.getTime() ?? 0));

    req.setInput(i);
    req.setScheduledstarttimestamp(ts);

    console.log(`Starting new ${name} instance with ID = ${req.getInstanceid()}`);

    const prom = promisify(this._stub.startInstance);
    const res = (await prom(req)) as pb.CreateInstanceResponse;

    return res.getInstanceid();
  }

  async getOrchestrationState(
    instanceId: string,
    fetchPayloads: boolean = true,
  ): Promise<OrchestrationState | undefined> {
    const req = new pb.GetInstanceRequest();
    req.setInstanceid(instanceId);
    req.setGetinputsandoutputs(fetchPayloads);

    const prom = promisify(this._stub.getInstance);
    const res = (await prom(req)) as pb.GetInstanceResponse;

    return newOrchestrationState(req.getInstanceid(), res);
  }

  async waitForOrchestrationStart(
    instanceId: string,
    fetchPayloads: boolean = false,
    timeout: number = 60,
  ): Promise<OrchestrationState | undefined> {
    const req = new pb.GetInstanceRequest();
    req.setInstanceid(instanceId);
    req.setGetinputsandoutputs(fetchPayloads);

    const prom = promisify(this._stub.waitForInstanceStart);

    try {
      // @todo: set timeout
      const res = (await prom(req)) as pb.GetInstanceResponse;
      return newOrchestrationState(req.getInstanceid(), res);
    } catch (e) {
      // @todo: handle deadline exceeded error
      console.log(e);
      throw e;
    }
  }

  async waitForOrchestrationCompletion(
    instanceId: string,
    fetchPayloads: boolean = false,
    timeout: number = 60,
  ): Promise<OrchestrationState | undefined> {
    const req = new pb.GetInstanceRequest();
    req.setInstanceid(instanceId);
    req.setGetinputsandoutputs(fetchPayloads);

    const prom = promisify(this._stub.waitForInstanceCompletion);

    try {
      // @todo: set timeout
      const res = (await prom(req)) as pb.GetInstanceResponse;
      return newOrchestrationState(req.getInstanceid(), res);
    } catch (e) {
      // @todo: handle deadline exceeded error
      console.log(e);
      throw e;
    }
  }

  async raiseOrchestrationEvent(instanceId: string, eventName: string, data: any = null): Promise<void> {
    const req = new pb.RaiseEventRequest();
    req.setInstanceid(instanceId);
    req.setName(eventName);

    const i = new StringValue();
    i.setValue(JSON.stringify(data));

    req.setInput(i);

    console.log(`Raising event '${eventName}' for instance '${instanceId}'`);

    const prom = promisify(this._stub.raiseEvent);
    await prom(req);
  }

  async terminateOrchestration(instanceId: string, output: any = null): Promise<void> {
    const req = new pb.TerminateRequest();
    req.setInstanceid(instanceId);

    const i = new StringValue();
    i.setValue(JSON.stringify(output));

    req.setOutput(i);

    console.log(`Terminating '${instanceId}'`);

    const prom = promisify(this._stub.terminateInstance);
    await prom(req);
  }

  async suspendOrchestration(instanceId: string): Promise<void> {
    const req = new pb.SuspendRequest();
    req.setInstanceid(instanceId);

    console.log(`Suspending '${instanceId}'`);

    const prom = promisify(this._stub.suspendInstance);
    await prom(req);
  }

  async resumeOrchestration(instanceId: string): Promise<void> {
    const req = new pb.ResumeRequest();
    req.setInstanceid(instanceId);

    console.log(`Resuming '${instanceId}'`);

    const prom = promisify(this._stub.resumeInstance);
    await prom(req);
  }
}
