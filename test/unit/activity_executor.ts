import { ActivityContext, ActivityNotRegisteredError } from "durable-functions";
import { _ActivityExecutor, _Registry } from "durabletask";

const shared = require("durabletask/internal/shared");

const TEST_LOGGER = shared.get_logger();
const TEST_INSTANCE_ID = "abc123";
const TEST_TASK_ID = 42;

describe("Activity function tests", () => {
  test("Validates activity function input population", async () => {
    const test_activity = (ctx: ActivityContext, test_input: any) => {
      // return all activity inputs back as the output
      return [test_input, ctx.orchestrationInstance.instanceId, ctx.taskToken];
    };

    const activity_input = "Hello, 世界!";
    const [executor, name] = getActivityExecutor(test_activity);
    const result = await executor.execute(
      TEST_INSTANCE_ID,
      name,
      TEST_TASK_ID,
      JSON.stringify(activity_input)
    );
    expect(result).not.toBeNull();

    const [result_input, result_orchestration_id, result_task_id] =
      JSON.parse(result);
    expect(activity_input).toEqual(result_input);
    expect(TEST_INSTANCE_ID).toEqual(result_orchestration_id);
    expect(TEST_TASK_ID).toEqual(result_task_id);
  });

  test("Throws ActivityNotRegisteredError when activity not registered", async () => {
    const test_activity = (ctx: ActivityContext, _: any) => {
      // not used
    };

    const [executor] = getActivityExecutor(test_activity);

    let caught_exception: Error | null = null;
    try {
      await executor.execute(TEST_INSTANCE_ID, "Bogus", TEST_TASK_ID, null);
    } catch (ex) {
      caught_exception = ex;
    }

    expect(caught_exception).toBeInstanceOf(ActivityNotRegisteredError);
    expect(caught_exception?.message).toMatch(/Bogus/);
  });
});

function getActivityExecutor(fn: Function): [_ActivityExecutor, string] {
  const registry = new _Registry();
  const name = registry.addActivity(fn);
  const executor = new _ActivityExecutor(registry, TEST_LOGGER);
  return [executor, name];
}
