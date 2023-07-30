import { TaskHubGrpcClient } from "../../src/client";
import { OrchestrationStatus } from "../../src/proto/orchestrator_service_pb";
import { getName, whenAll, whenAny } from "../../src/task";
import { ActivityContext } from "../../src/task/context/activity-context";
import { OrchestrationContext } from "../../src/task/context/orchestration-context";
import { TOrchestrator } from "../../src/types/orchestrator.type";
import { TaskHubGrpcWorker } from "../../src/worker/task-hub-grpc-worker";

describe("Durable Functions", () => {
  let taskHubClient: TaskHubGrpcClient;
  let taskHubWorker: TaskHubGrpcWorker;

  beforeAll(async () => {
    // Ensure the sidecar process is running
    // docker run --name durabletask-sidecar -p 4001:4001 --env 'DURABLETASK_SIDECAR_LOGLEVEL=Debug' --rm cgillum/durabletask-sidecar:latest start --backend Emulator
    // TODO:
  });

  beforeEach(async () => {
    // Start a worker, which will connect to the sidecar in a background thread
    taskHubWorker = new TaskHubGrpcWorker();
    taskHubClient = new TaskHubGrpcClient();
  });

  afterEach(async () => {
    await taskHubWorker.stop();
  });

  afterAll(async () => {
    await taskHubWorker.stop();
  });

  it("should be able to run an empty orchestration", async () => {
    let invoked = false;

    const emptyOrchestrator: TOrchestrator = async (ctx: OrchestrationContext, input: any) => {
      // nonlocal invoked
      // TODO: What is the above in python??
      invoked = true;
    };

    taskHubWorker.addOrchestrator(emptyOrchestrator);
    await taskHubWorker.start();

    const id = await taskHubClient.scheduleNewOrchestration(emptyOrchestrator);
    const state = await taskHubClient.waitForOrchestrationCompletion(id, undefined, 30);

    expect(invoked);
    expect(state);
    expect(state?.name).toEqual(getName(emptyOrchestrator));
    expect(state?.instanceId).toEqual(id);
    expect(state?.failureDetails).toBeUndefined();
    expect(state?.runtimeStatus).toEqual(OrchestrationStatus.ORCHESTRATION_STATUS_COMPLETED);
    expect(state?.serializedInput).toBeUndefined();
    expect(state?.serializedOutput).toBeUndefined();
    expect(state?.serializedCustomStatus).toBeUndefined();
  });

  it("should be able to run an activity sequence", async () => {
    const plusOne = async (_: ActivityContext, input: number) => {
      return input + 1;
    };

    const sequence: TOrchestrator = async function* (ctx: OrchestrationContext, startVal: number): any {
      const numbers = [startVal];
      let current = startVal;

      for (let i = 0; i < 10; i++) {
        current = yield ctx.callActivity(plusOne, current);
        numbers.push(current);
      }

      return numbers;
    };

    taskHubWorker.addOrchestrator(sequence);
    taskHubWorker.addActivity(plusOne);
    await taskHubWorker.start();

    const id = await taskHubClient.scheduleNewOrchestration(sequence, 1);
    const state = await taskHubClient.waitForOrchestrationCompletion(id, undefined, 30);

    expect(state);
    expect(state?.name).toEqual(getName(sequence));
    expect(state?.instanceId).toEqual(id);
    expect(state?.failureDetails).toBeUndefined();
    expect(state?.runtimeStatus).toEqual(OrchestrationStatus.ORCHESTRATION_STATUS_COMPLETED);
    expect(state?.serializedInput).toEqual(JSON.stringify(1));
    expect(state?.serializedOutput).toEqual(JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]));
    expect(state?.serializedCustomStatus).toBeUndefined();
  });

  it("should be able to use the sub-orchestration for fan-out", async () => {
    let activityCounter = 0;

    const increment = (ctx: ActivityContext, _: any) => {
      activityCounter++;
    };

    const orchestratorChild: TOrchestrator = async function* (ctx: OrchestrationContext, activityCount: number): any {
      for (let i = 0; i < activityCount; i++) {
        yield ctx.callActivity(increment);
      }
    };

    const orchestratorParent: TOrchestrator = async function* (ctx: OrchestrationContext, count: number): any {
      // Fan out to multiple sub-orchestrations
      const tasks = [];

      for (let i = 0; i < count; i++) {
        tasks.push(ctx.callSubOrchestrator(orchestratorChild, 3));
      }

      // Wait for all the sub-orchestrations to complete
      yield whenAll(tasks);
    };

    taskHubWorker.addActivity(increment);
    taskHubWorker.addOrchestrator(orchestratorChild);
    taskHubWorker.addOrchestrator(orchestratorParent);
    await taskHubWorker.start();

    const id = await taskHubClient.scheduleNewOrchestration(orchestratorParent, 10);
    const state = await taskHubClient.waitForOrchestrationCompletion(id, undefined, 30);

    expect(state);
    expect(state?.runtimeStatus).toEqual(OrchestrationStatus.ORCHESTRATION_STATUS_COMPLETED);
    expect(state?.failureDetails).toBeUndefined();
    expect(activityCounter).toEqual(30);
  });

  it("should allow waiting for multiple extenral events", async () => {
    const orchestrator: TOrchestrator = async function* (ctx: OrchestrationContext, _: any): any {
      const a = yield ctx.waitForExternalEvent("A");
      const b = yield ctx.waitForExternalEvent("B");
      const c = yield ctx.waitForExternalEvent("C");
      return [a, b, c];
    };

    taskHubWorker.addOrchestrator(orchestrator);
    await taskHubWorker.start();

    // Send events to the client immediately
    const id = await taskHubClient.scheduleNewOrchestration(orchestrator);
    taskHubClient.raiseOrchestrationEvent(id, "A", "a");
    taskHubClient.raiseOrchestrationEvent(id, "B", "b");
    taskHubClient.raiseOrchestrationEvent(id, "C", "c");
    const state = await taskHubClient.waitForOrchestrationCompletion(id, undefined, 30);

    expect(state);
    expect(state?.runtimeStatus).toEqual(OrchestrationStatus.ORCHESTRATION_STATUS_COMPLETED);
    expect(state?.serializedOutput).toEqual(JSON.stringify(["a", "b", "c"]));
  });

  it("should wait for external events with a timeout", async () => {
    for (const shouldRaiseEvent of [true, false]) {
      const orchestrator: TOrchestrator = async function* (ctx: OrchestrationContext, _: any): any {
        const approval = ctx.waitForExternalEvent("Approval");
        const timeout = ctx.createTimer(3 * 1000);
        const winner = yield whenAny([approval, timeout]);

        if (winner == approval) {
          return "approved";
        } else {
          return "timed out";
        }
      };

      taskHubWorker.addOrchestrator(orchestrator);
      await taskHubWorker.start();

      // Send events to the client immediately
      const id = await taskHubClient.scheduleNewOrchestration(orchestrator);

      if (shouldRaiseEvent) {
        taskHubClient.raiseOrchestrationEvent(id, "Approval");
      }

      const state = await taskHubClient.waitForOrchestrationCompletion(id, undefined, 30);

      expect(state);
      expect(state?.runtimeStatus).toEqual(OrchestrationStatus.ORCHESTRATION_STATUS_COMPLETED);

      if (shouldRaiseEvent) {
        expect(state?.serializedOutput).toEqual(JSON.stringify("approved"));
      } else {
        expect(state?.serializedOutput).toEqual(JSON.stringify("timed out"));
      }
    }
  });

  it("should be able to use suspend and resume", async () => {
    const orchestrator: TOrchestrator = async function* (ctx: OrchestrationContext, _: any): any {
      const res = yield ctx.waitForExternalEvent("my_event");
      return res;
    };

    taskHubWorker.addOrchestrator(orchestrator);
    await taskHubWorker.start();

    // Send events to the client immediately
    const id = await taskHubClient.scheduleNewOrchestration(orchestrator);
    let state = await taskHubClient.waitForOrchestrationCompletion(id, undefined, 30);
    expect(state);

    // Suspend the orchestration and wait for it to go into the SUSPENDED state
    await taskHubClient.suspendOrchestration(id);

    // TODO: is this needed in JS? We use a promise above
    // while (state?.runtimeStatus == OrchestrationStatus.ORCHESTRATION_STATUS_RUNNING) {
    // await new Promise((resolve) => setTimeout(resolve, 100));
    // state = await taskHubClient.waitForOrchestrationCompletion(id, undefined, 30);
    // expect(state);
    // }

    // Raise an event to the orchestration and confirm that it does NOT complete
    taskHubClient.raiseOrchestrationEvent(id, "my_event", 42);

    try {
      state = await taskHubClient.waitForOrchestrationCompletion(id, undefined, 3);
      // TODO
      // assert False, "Orchestration should not have been completed"
    } catch (e) {
      // pass
    }

    // Resume the orchestration and wait for it to complete
    taskHubClient.resumeOrchestration(id);
    state = await taskHubClient.waitForOrchestrationCompletion(id, undefined, 30);
    expect(state);
    expect(state?.runtimeStatus).toEqual(OrchestrationStatus.ORCHESTRATION_STATUS_COMPLETED);
    expect(state?.serializedOutput).toEqual(JSON.stringify(42));
  });

  it("should be able to terminate an orchestration", async () => {
    const orchestrator: TOrchestrator = async function* (ctx: OrchestrationContext, _: any): any {
      const res = yield ctx.waitForExternalEvent("my_event");
      return res;
    };

    taskHubWorker.addOrchestrator(orchestrator);
    await taskHubWorker.start();

    const id = await taskHubClient.scheduleNewOrchestration(orchestrator);
    let state = await taskHubClient.waitForOrchestrationStart(id, undefined, 30);
    expect(state);
    expect(state?.runtimeStatus).toEqual(OrchestrationStatus.ORCHESTRATION_STATUS_RUNNING);

    taskHubClient.terminateOrchestration(id, "some reason for termination");
    state = await taskHubClient.waitForOrchestrationStart(id, undefined, 30);
    expect(state);
    expect(state?.runtimeStatus).toEqual(OrchestrationStatus.ORCHESTRATION_STATUS_TERMINATED);
    expect(state?.serializedOutput).toEqual(JSON.stringify("some reason for termination"));
  });

  it("should allow to continue as new", async () => {
    const allResults: any[] = [];

    const orchestrator: TOrchestrator = async function* (ctx: OrchestrationContext, input: number): any {
      const res = yield ctx.waitForExternalEvent("my_event");

      if (!ctx.isReplaying) {
        allResults.push(res);
      }

      if (allResults.length <= 4) {
        ctx.continueAsNew(Math.max(...allResults), true);
      } else {
        return allResults;
      }
    };

    taskHubWorker.addOrchestrator(orchestrator);
    await taskHubWorker.start();

    const id = await taskHubClient.scheduleNewOrchestration(orchestrator);
    taskHubClient.raiseOrchestrationEvent(id, "my_event", 1);
    taskHubClient.raiseOrchestrationEvent(id, "my_event", 2);
    taskHubClient.raiseOrchestrationEvent(id, "my_event", 3);
    taskHubClient.raiseOrchestrationEvent(id, "my_event", 4);
    taskHubClient.raiseOrchestrationEvent(id, "my_event", 5);

    const state = await taskHubClient.waitForOrchestrationStart(id, undefined, 30);
    expect(state);
    expect(state?.runtimeStatus).toEqual(OrchestrationStatus.ORCHESTRATION_STATUS_COMPLETED);
    expect(state?.serializedInput).toEqual(JSON.stringify(4));
    expect(state?.serializedOutput).toEqual(JSON.stringify(allResults));
    expect(allResults).toEqual([1, 2, 3, 4, 5]);
  });
});
