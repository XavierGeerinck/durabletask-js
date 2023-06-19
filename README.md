# DurableTask Javascript

This repo contains a Javascript client SDK for use with the [Durable Task Framework for Go](https://github.com/microsoft/durabletask-go) and [Dapr Workflow](https://docs.dapr.io/developing-applications/building-blocks/workflow/workflow-overview/). With this SDK, you can define, schedule, and manage durable orchestrations using ordinary Javascript code.

> This SDK is currently under active development and is not yet ready for production use.

Note that this project is **not** currently affiliated with the [Durable Functions](https://docs.microsoft.com/azure/azure-functions/durable/durable-functions-overview) project for Azure Functions.

## TODO

This repo has the version as of [26/APR/2023](https://github.com/microsoft/durabletask-python/commit/b5b24c728518857b83aff96acf66686da2876578)


### Implement

- [x] `src/worker/activity-executor.ts`
- [x] `src/worker/executor-methods.ts`
- [x] `src/worker/orchestration-executor.ts`
- [] Add the tests

### Resolve bugs

- [ ] `src/worker/runtime-orchestration-context.ts` currently implements `nextTask`. This should continue execution of a function in a generator. However, Javascript has no native resume functionality and this should be implemented with [infinite looping yields](https://stackoverflow.com/questions/67762588/how-to-pause-and-resume-function-execution-in-javascript).
