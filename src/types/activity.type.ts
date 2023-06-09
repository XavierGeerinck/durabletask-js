import { ActivityContext } from "../task/context/activity-context";

export type TActivity<TInput, TOutput> = (context: ActivityContext, input: TInput) => TOutput;