import { CompleteOrchestrationAction, OrchestratorAction } from "../../src/proto/orchestrator_service_pb";
import { OrchestrationContext } from "../../src/task/context/orchestration-context";
import { newExecutionStartedEvent, newOrchestratorStartedEvent } from "../../src/utils/pb-helper.util";
import { OrchestrationExecutor } from "../../src/worker/orchestration-executor";
import * as pb from "../../src/proto/orchestrator_service_pb";
import { Registry } from "../../src/worker/registry";

// const TEST_LOGGER = shared.get_logger();
const TEST_INSTANCE_ID = "abc123";
const TEST_TASK_ID = 42;

describe("Orchestration Executor", () => {
  it("should validate the orchestrator function input population", async () => {
    const orchestrator = async (ctx: OrchestrationContext, myInput: number) => {
      // return all orchestrator inputs back as the output
      return [myInput, ctx.instanceId, ctx.currentUtcDateTime, ctx.isReplaying];
    }

    const testInput = 42;
    const registry = new Registry();
    const name = registry.addOrchestrator(orchestrator);

    const startTime = new Date();
    const newEvents = [
      newOrchestratorStartedEvent(startTime),
      newExecutionStartedEvent(name, TEST_INSTANCE_ID, JSON.stringify(testInput))
    ]
    const executor = new OrchestrationExecutor(registry);
    const actions = executor.execute(TEST_INSTANCE_ID, [], newEvents);

    const completeAction = getAndValidateSingleCompleteOrchestrationAction(actions);

    expect(completeAction?.getOrchestrationstatus()).toEqual(pb.OrchestrationStatus.ORCHESTRATION_STATUS_COMPLETED);
    expect(completeAction?.getResult()).not.toBeNull();

    const expectedOutput = [testInput, TEST_INSTANCE_ID, startTime.toISOString(), false];
    expect(completeAction?.getResult()).toEqual(JSON.stringify(expectedOutput));
  });
});

function getAndValidateSingleCompleteOrchestrationAction(actions: OrchestratorAction[]): CompleteOrchestrationAction | undefined {
  expect(actions.length).toEqual(1);
  const action = actions[0];
  expect(action?.constructor?.name).toEqual(CompleteOrchestrationAction.name);
  expect(action).toHaveProperty("completeOrchestration");
  return action.getCompleteorchestration();
}