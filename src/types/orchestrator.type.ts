import { OrchestrationContext } from "../task/context/orchestration-context";

export type TOrchestrator<TInput = any, TOutput = any> = (
  context: OrchestrationContext,
  input: TInput | undefined,
) => Promise<TOutput>;
