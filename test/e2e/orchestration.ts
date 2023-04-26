import {
  TaskHubGrpcClient,
  TaskHubGrpcWorker,
  OrchestrationStatus,
  ExternalEvent,
} from "durabletask-grpc";
import { OrchestrationContext, Task, ActivityContext } from "durabletask";

describe("Durable Functions", () => {
  let taskHubClient: TaskHubGrpcClient;
  let taskHubWorker: TaskHubGrpcWorker;
  let externalEvents: ExternalEvent[];

  beforeAll(async () => {
    // Start a worker, which will connect to the sidecar in a background thread
    taskHubWorker = new TaskHubGrpcWorker();
    await taskHubWorker.start();

    taskHubClient = new TaskHubGrpcClient();

    externalEvents = [
      { eventName: "A", data: "a" },
      { eventName: "B", data: "b" },
      { eventName: "C", data: "c" },
    ];
  });

  afterAll(async () => {
    await taskHubWorker.stop();
  });

  test("empty orchestration", async () => {
    let invoked = false;

    const emptyOrchestrator: Task<void> = async (
      ctx: OrchestrationContext,
      _
    ): Promise<void> => {
      invoked = true;
    };

    taskHubWorker.addOrchestrator(emptyOrchestrator);

    const id = await taskHubClient.startOrchestration(emptyOrchestrator);
    const state = await taskHubClient.waitForCompletion(id, 30);

    expect(invoked).toBeTruthy();
    expect(state).not.toBeNull();
    expect(state.name).toBe(emptyOrchestrator.getName());
    expect(state.instanceId).toBe(id);
    expect(state.failureDetails).toBeUndefined();
    expect(state.runtimeStatus).toBe(OrchestrationStatus.Completed);
    expect(state.input).toBeNull();
    expect(state.output).toBeNull();
    expect(state.customStatus).toBeUndefined();
  });

  test("activity sequence", async () => {
    const plusOne: Task<number, number> = async (
      _: ActivityContext,
      input: number
    ): Promise<number> => {
      return input + 1;
    };

    const sequence: Task<number[], number> = async (
      ctx: OrchestrationContext,
      startVal: number
    ): Promise<number[]> => {
      const numbers: number[] = [startVal];
      let current: number = startVal;

      for (let i = 0; i < 10; i++) {
        current = await ctx.callActivity(plusOne, current);
        numbers.push(current);
      }

      return numbers;
    };

    taskHubWorker.addOrchestrator(sequence);
    taskHubWorker.addActivity(plusOne);

    const id = await taskHubClient.startOrchestration(sequence, 1);
    const state = await taskHubClient.waitForCompletion(id, 30);

    expect(state).not.toBeNull();
    expect(state.name).toBe(sequence.getName());
    expect(state.instanceId).toBe(id);
    expect(state.runtimeStatus).toBe(OrchestrationStatus.Completed);
    expect(state.failureDetails).toBeUndefined();
    expect(state.input).toBe(JSON.stringify(1));
    expect(state.output).toBe(
      JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    );
    expect(state.customStatus).toBeUndefined();
  });
});
