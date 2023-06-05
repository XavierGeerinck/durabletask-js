class _OrchestrationExecutor:
    _generator: Union[task.Orchestrator, None]

    def __init__(self, registry: _Registry, logger: logging.Logger):
        self._registry = registry
        self._logger = logger
        self._generator = None
        self._is_suspended = False
        self._suspended_events: List[pb.HistoryEvent] = []

    def execute(self, instance_id: str, old_events: Sequence[pb.HistoryEvent], new_events: Sequence[pb.HistoryEvent]) -> List[pb.OrchestratorAction]:
        if not new_events:
            raise task.OrchestrationStateError("The new history event list must have at least one event in it.")

        ctx = _RuntimeOrchestrationContext(instance_id)
        try:
            # Rebuild local state by replaying old history into the orchestrator function
            self._logger.debug(f"{instance_id}: Rebuilding local state with {len(old_events)} history event...")
            ctx._is_replaying = True
            for old_event in old_events:
                self.process_event(ctx, old_event)

            # Get new actions by executing newly received events into the orchestrator function
            if self._logger.level <= logging.DEBUG:
                summary = _get_new_event_summary(new_events)
                self._logger.debug(f"{instance_id}: Processing {len(new_events)} new event(s): {summary}")
            ctx._is_replaying = False
            for new_event in new_events:
                self.process_event(ctx, new_event)

        except Exception as ex:
            # Unhandled exceptions fail the orchestration
            ctx.set_failed(ex)

        if not ctx._is_complete:
            task_count = len(ctx._pending_tasks)
            event_count = len(ctx._pending_events)
            self._logger.info(f"{instance_id}: Waiting for {task_count} task(s) and {event_count} event(s).")
        elif ctx._completion_status and ctx._completion_status is not pb.ORCHESTRATION_STATUS_CONTINUED_AS_NEW:
            completion_status_str = pbh.get_orchestration_status_str(ctx._completion_status)
            self._logger.info(f"{instance_id}: Orchestration completed with status: {completion_status_str}")

        actions = ctx.get_actions()
        if self._logger.level <= logging.DEBUG:
            self._logger.debug(f"{instance_id}: Returning {len(actions)} action(s): {_get_action_summary(actions)}")
        return actions

    def process_event(self, ctx: _RuntimeOrchestrationContext, event: pb.HistoryEvent) -> None:
        if self._is_suspended and _is_suspendable(event):
            # We are suspended, so we need to buffer this event until we are resumed
            self._suspended_events.append(event)
            return

        # CONSIDER: change to a switch statement with event.WhichOneof("eventType")
        try:
            if event.HasField("orchestratorStarted"):
                ctx.current_utc_datetime = event.timestamp.ToDatetime()
            elif event.HasField("executionStarted"):
                # TODO: Check if we already started the orchestration
                fn = self._registry.get_orchestrator(event.executionStarted.name)
                if fn is None:
                    raise OrchestratorNotRegisteredError(
                        f"A '{event.executionStarted.name}' orchestrator was not registered.")

                # deserialize the input, if any
                input = None
                if event.executionStarted.input is not None and event.executionStarted.input.value != "":
                    input = shared.from_json(event.executionStarted.input.value)

                result = fn(ctx, input)  # this does not execute the generator, only creates it
                if isinstance(result, GeneratorType):
                    # Start the orchestrator's generator function
                    ctx.run(result)
                else:
                    # This is an orchestrator that doesn't schedule any tasks
                    ctx.set_complete(result, pb.ORCHESTRATION_STATUS_COMPLETED)
            elif event.HasField("timerCreated"):
                # This history event confirms that the timer was successfully scheduled.
                # Remove the timerCreated event from the pending action list so we don't schedule it again.
                timer_id = event.eventId
                action = ctx._pending_actions.pop(timer_id, None)
                if not action:
                    raise _get_non_determinism_error(timer_id, task.get_name(ctx.create_timer))
                elif not action.HasField("createTimer"):
                    expected_method_name = task.get_name(ctx.create_timer)
                    raise _get_wrong_action_type_error(timer_id, expected_method_name, action)
            elif event.HasField("timerFired"):
                timer_id = event.timerFired.timerId
                timer_task = ctx._pending_tasks.pop(timer_id, None)
                if not timer_task:
                    # TODO: Should this be an error? When would it ever happen?
                    if not ctx._is_replaying:
                        self._logger.warning(
                            f"{ctx.instance_id}: Ignoring unexpected timerFired event with ID = {timer_id}.")
                    return
                timer_task.complete(None)
                ctx.resume()
            elif event.HasField("taskScheduled"):
                # This history event confirms that the activity execution was successfully scheduled.
                # Remove the taskScheduled event from the pending action list so we don't schedule it again.
                task_id = event.eventId
                action = ctx._pending_actions.pop(task_id, None)
                if not action:
                    raise _get_non_determinism_error(task_id, task.get_name(ctx.call_activity))
                elif not action.HasField("scheduleTask"):
                    expected_method_name = task.get_name(ctx.call_activity)
                    raise _get_wrong_action_type_error(task_id, expected_method_name, action)
                elif action.scheduleTask.name != event.taskScheduled.name:
                    raise _get_wrong_action_name_error(
                        task_id,
                        method_name=task.get_name(ctx.call_activity),
                        expected_task_name=event.taskScheduled.name,
                        actual_task_name=action.scheduleTask.name)
            elif event.HasField("taskCompleted"):
                # This history event contains the result of a completed activity task.
                task_id = event.taskCompleted.taskScheduledId
                activity_task = ctx._pending_tasks.pop(task_id, None)
                if not activity_task:
                    # TODO: Should this be an error? When would it ever happen?
                    if not ctx.is_replaying:
                        self._logger.warning(
                            f"{ctx.instance_id}: Ignoring unexpected taskCompleted event with ID = {task_id}.")
                    return
                result = None
                if not ph.is_empty(event.taskCompleted.result):
                    result = shared.from_json(event.taskCompleted.result.value)
                activity_task.complete(result)
                ctx.resume()
            elif event.HasField("taskFailed"):
                task_id = event.taskFailed.taskScheduledId
                activity_task = ctx._pending_tasks.pop(task_id, None)
                if not activity_task:
                    # TODO: Should this be an error? When would it ever happen?
                    if not ctx.is_replaying:
                        self._logger.warning(
                            f"{ctx.instance_id}: Ignoring unexpected taskFailed event with ID = {task_id}.")
                    return
                activity_task.fail(
                    f"{ctx.instance_id}: Activity task #{task_id} failed: {event.taskFailed.failureDetails.errorMessage}",
                    event.taskFailed.failureDetails)
                ctx.resume()
            elif event.HasField("subOrchestrationInstanceCreated"):
                # This history event confirms that the sub-orchestration execution was successfully scheduled.
                # Remove the subOrchestrationInstanceCreated event from the pending action list so we don't schedule it again.
                task_id = event.eventId
                action = ctx._pending_actions.pop(task_id, None)
                if not action:
                    raise _get_non_determinism_error(task_id, task.get_name(ctx.call_sub_orchestrator))
                elif not action.HasField("createSubOrchestration"):
                    expected_method_name = task.get_name(ctx.call_sub_orchestrator)
                    raise _get_wrong_action_type_error(task_id, expected_method_name, action)
                elif action.createSubOrchestration.name != event.subOrchestrationInstanceCreated.name:
                    raise _get_wrong_action_name_error(
                        task_id,
                        method_name=task.get_name(ctx.call_sub_orchestrator),
                        expected_task_name=event.subOrchestrationInstanceCreated.name,
                        actual_task_name=action.createSubOrchestration.name)
            elif event.HasField("subOrchestrationInstanceCompleted"):
                task_id = event.subOrchestrationInstanceCompleted.taskScheduledId
                sub_orch_task = ctx._pending_tasks.pop(task_id, None)
                if not sub_orch_task:
                    # TODO: Should this be an error? When would it ever happen?
                    if not ctx.is_replaying:
                        self._logger.warning(
                            f"{ctx.instance_id}: Ignoring unexpected subOrchestrationInstanceCompleted event with ID = {task_id}.")
                    return
                result = None
                if not ph.is_empty(event.subOrchestrationInstanceCompleted.result):
                    result = shared.from_json(event.subOrchestrationInstanceCompleted.result.value)
                sub_orch_task.complete(result)
                ctx.resume()
            elif event.HasField("subOrchestrationInstanceFailed"):
                failedEvent = event.subOrchestrationInstanceFailed
                task_id = failedEvent.taskScheduledId
                sub_orch_task = ctx._pending_tasks.pop(task_id, None)
                if not sub_orch_task:
                    # TODO: Should this be an error? When would it ever happen?
                    if not ctx.is_replaying:
                        self._logger.warning(
                            f"{ctx.instance_id}: Ignoring unexpected subOrchestrationInstanceFailed event with ID = {task_id}.")
                    return
                sub_orch_task.fail(
                    f"Sub-orchestration task #{task_id} failed: {failedEvent.failureDetails.errorMessage}",
                    failedEvent.failureDetails)
                ctx.resume()
            elif event.HasField("eventRaised"):
                # event names are case-insensitive
                event_name = event.eventRaised.name.casefold()
                if not ctx.is_replaying:
                    self._logger.info(f"{ctx.instance_id} Event raised: {event_name}")
                task_list = ctx._pending_events.get(event_name, None)
                decoded_result: Union[Any, None] = None
                if task_list:
                    event_task = task_list.pop(0)
                    if not ph.is_empty(event.eventRaised.input):
                        decoded_result = shared.from_json(event.eventRaised.input.value)
                    event_task.complete(decoded_result)
                    if not task_list:
                        del ctx._pending_events[event_name]
                    ctx.resume()
                else:
                    # buffer the event
                    event_list = ctx._received_events.get(event_name, None)
                    if not event_list:
                        event_list = []
                        ctx._received_events[event_name] = event_list
                    if not ph.is_empty(event.eventRaised.input):
                        decoded_result = shared.from_json(event.eventRaised.input.value)
                    event_list.append(decoded_result)
                    if not ctx.is_replaying:
                        self._logger.info(f"{ctx.instance_id}: Event '{event_name}' has been buffered as there are no tasks waiting for it.")
            elif event.HasField("executionSuspended"):
                if not self._is_suspended and not ctx.is_replaying:
                    self._logger.info(f"{ctx.instance_id}: Execution suspended.")
                self._is_suspended = True
            elif event.HasField("executionResumed") and self._is_suspended:
                if not ctx.is_replaying:
                    self._logger.info(f"{ctx.instance_id}: Resuming execution.")
                self._is_suspended = False
                for e in self._suspended_events:
                    self.process_event(ctx, e)
                self._suspended_events = []
            elif event.HasField("executionTerminated"):
                if not ctx.is_replaying:
                    self._logger.info(f"{ctx.instance_id}: Execution terminating.")
                encoded_output = event.executionTerminated.input.value if not ph.is_empty(event.executionTerminated.input) else None
                ctx.set_complete(encoded_output, pb.ORCHESTRATION_STATUS_TERMINATED, is_result_encoded=True)
            else:
                eventType = event.WhichOneof("eventType")
                raise task.OrchestrationStateError(f"Don't know how to handle event of type '{eventType}'")
        except StopIteration as generatorStopped:
            # The orchestrator generator function completed
            ctx.set_complete(generatorStopped.value, pb.ORCHESTRATION_STATUS_COMPLETED)