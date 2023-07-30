# def test_suspend_and_resume():
#     def orchestrator(ctx: task.OrchestrationContext, _):
#         result = yield ctx.wait_for_external_event("my_event")
#         return result

#     # Start a worker, which will connect to the sidecar in a background thread
#     with worker.TaskHubGrpcWorker() as w:
#         w.add_orchestrator(orchestrator)
#         w.start()

#         task_hub_client = client.TaskHubGrpcClient()
#         id = task_hub_client.schedule_new_orchestration(orchestrator)
#         state = task_hub_client.wait_for_orchestration_start(id, timeout=30)
#         assert state is not None

#         # Suspend the orchestration and wait for it to go into the SUSPENDED state
#         task_hub_client.suspend_orchestration(id)
#         while state.runtime_status == client.OrchestrationStatus.RUNNING:
#             time.sleep(0.1)
#             state = task_hub_client.get_orchestration_state(id)
#             assert state is not None
#         assert state.runtime_status == client.OrchestrationStatus.SUSPENDED

#         # Raise an event to the orchestration and confirm that it does NOT complete
#         task_hub_client.raise_orchestration_event(id, "my_event", data=42)
#         try:
#             state = task_hub_client.wait_for_orchestration_completion(
#                 id, timeout=3)
#             assert False, "Orchestration should not have completed"
#         except TimeoutError:
#             pass

#         # Resume the orchestration and wait for it to complete
#         task_hub_client.resume_orchestration(id)
#         state = task_hub_client.wait_for_orchestration_completion(
#             id, timeout=30)
#         assert state is not None
#         assert state.runtime_status == client.OrchestrationStatus.COMPLETED
#         assert state.serialized_output == json.dumps(42)


# def test_terminate():
#     def orchestrator(ctx: task.OrchestrationContext, _):
#         result = yield ctx.wait_for_external_event("my_event")
#         return result

#     # Start a worker, which will connect to the sidecar in a background thread
#     with worker.TaskHubGrpcWorker() as w:
#         w.add_orchestrator(orchestrator)
#         w.start()

#         task_hub_client = client.TaskHubGrpcClient()
#         id = task_hub_client.schedule_new_orchestration(orchestrator)
#         state = task_hub_client.wait_for_orchestration_start(id, timeout=30)
#         assert state is not None
#         assert state.runtime_status == client.OrchestrationStatus.RUNNING

#         task_hub_client.terminate_orchestration(
#             id, output="some reason for termination")
#         state = task_hub_client.wait_for_orchestration_completion(
#             id, timeout=30)
#         assert state is not None
#         assert state.runtime_status == client.OrchestrationStatus.TERMINATED
#         assert state.serialized_output == json.dumps(
#             "some reason for termination")


# def test_continue_as_new():
#     all_results = []

#     def orchestrator(ctx: task.OrchestrationContext, input: int):
#         result = yield ctx.wait_for_external_event("my_event")
#         if not ctx.is_replaying:
#             # NOTE: Real orchestrations should never interact with nonlocal variables like this.
#             nonlocal all_results
#             all_results.append(result)

#         if len(all_results) <= 4:
#             ctx.continue_as_new(max(all_results), save_events=True)
#         else:
#             return all_results

#     # Start a worker, which will connect to the sidecar in a background thread
#     with worker.TaskHubGrpcWorker() as w:
#         w.add_orchestrator(orchestrator)
#         w.start()

#         task_hub_client = client.TaskHubGrpcClient()
#         id = task_hub_client.schedule_new_orchestration(orchestrator, input=0)
#         task_hub_client.raise_orchestration_event(id, "my_event", data=1)
#         task_hub_client.raise_orchestration_event(id, "my_event", data=2)
#         task_hub_client.raise_orchestration_event(id, "my_event", data=3)
#         task_hub_client.raise_orchestration_event(id, "my_event", data=4)
#         task_hub_client.raise_orchestration_event(id, "my_event", data=5)

#         state = task_hub_client.wait_for_orchestration_completion(
#             id, timeout=30)
#         assert state is not None
#         assert state.runtime_status == client.OrchestrationStatus.COMPLETED
#         assert state.serialized_output == json.dumps(all_results)
#         assert state.serialized_input == json.dumps(4)
#         assert all_results == [1, 2, 3, 4, 5]
