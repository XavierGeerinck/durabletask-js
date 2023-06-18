import { ActivityContext } from "../task/context/activity-context";
import { Registry } from "./registry";

export class ActivityExecutor {
    private _registry: Registry;

    constructor(registry: Registry) {
        this._registry = registry;
    }

    public execute(orchestrationId: string, name: string, taskId: number, encodedInput?: string): string | undefined {
        const fn = this._registry.getActivity(name);

        if (!fn) {
            throw new Error(`Activity function ${name} is not registered`);
        }

        const activityInput = encodedInput ? JSON.parse(encodedInput) : undefined;
        const ctx = new ActivityContext(orchestrationId, taskId);

        // Execute the activity function
        const activityOutput = fn(ctx, activityInput);

        // Return the output
        const encodedOutput = activityOutput ? JSON.stringify(activityOutput) : undefined;
        const chars = encodedOutput ? encodedOutput.length : 0;
        console.log(`Activity ${name} completed with output ${encodedOutput} (${chars} chars)`);

        return encodedOutput;
    }
}