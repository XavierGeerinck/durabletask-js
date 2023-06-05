
def _get_non_determinism_error(task_id: int, action_name: str) -> task.NonDeterminismError:
    return task.NonDeterminismError(
        f"A previous execution called {action_name} with ID={task_id}, but the current "
        f"execution doesn't have this action with this ID. This problem occurs when either "
        f"the orchestration has non-deterministic logic or if the code was changed after an "
        f"instance of this orchestration already started running.")


def _get_wrong_action_type_error(
        task_id: int,
        expected_method_name: str,
        action: pb.OrchestratorAction) -> task.NonDeterminismError:
    unexpected_method_name = _get_method_name_for_action(action)
    return task.NonDeterminismError(
        f"Failed to restore orchestration state due to a history mismatch: A previous execution called "
        f"{expected_method_name} with ID={task_id}, but the current execution is instead trying to call "
        f"{unexpected_method_name} as part of rebuilding it's history. This kind of mismatch can happen if an "
        f"orchestration has non-deterministic logic or if the code was changed after an instance of this "
        f"orchestration already started running.")


def _get_wrong_action_name_error(
        task_id: int,
        method_name: str,
        expected_task_name: str,
        actual_task_name: str) -> task.NonDeterminismError:
    return task.NonDeterminismError(
        f"Failed to restore orchestration state due to a history mismatch: A previous execution called "
        f"{method_name} with name='{expected_task_name}' and sequence number {task_id}, but the current "
        f"execution is instead trying to call {actual_task_name} as part of rebuilding it's history. "
        f"This kind of mismatch can happen if an orchestration has non-deterministic logic or if the code "
        f"was changed after an instance of this orchestration already started running.")


def _get_method_name_for_action(action: pb.OrchestratorAction) -> str:
    action_type = action.WhichOneof('orchestratorActionType')
    if action_type == "scheduleTask":
        return task.get_name(task.OrchestrationContext.call_activity)
    elif action_type == "createTimer":
        return task.get_name(task.OrchestrationContext.create_timer)
    elif action_type == "createSubOrchestration":
        return task.get_name(task.OrchestrationContext.call_sub_orchestrator)
    # elif action_type == "sendEvent":
    #    return task.get_name(task.OrchestrationContext.send_event)
    else:
        raise NotImplementedError(f"Action type '{action_type}' not supported!")


def _get_new_event_summary(new_events: Sequence[pb.HistoryEvent]) -> str:
    """Returns a summary of the new events that can be used for logging."""
    if not new_events:
        return "[]"
    elif len(new_events) == 1:
        return f"[{new_events[0].WhichOneof('eventType')}]"
    else:
        counts: Dict[str, int] = {}
        for event in new_events:
            event_type = event.WhichOneof('eventType')
            counts[event_type] = counts.get(event_type, 0) + 1
        return f"[{', '.join(f'{name}={count}' for name, count in counts.items())}]"


def _get_action_summary(new_actions: Sequence[pb.OrchestratorAction]) -> str:
    """Returns a summary of the new actions that can be used for logging."""
    if not new_actions:
        return "[]"
    elif len(new_actions) == 1:
        return f"[{new_actions[0].WhichOneof('orchestratorActionType')}]"
    else:
        counts: Dict[str, int] = {}
        for action in new_actions:
            action_type = action.WhichOneof('orchestratorActionType')
            counts[action_type] = counts.get(action_type, 0) + 1
        return f"[{', '.join(f'{name}={count}' for name, count in counts.items())}]"


def _is_suspendable(event: pb.HistoryEvent) -> bool:
    """Returns true if the event is one that can be suspended and resumed."""
    return event.WhichOneof("eventType") not in ["executionResumed", "executionTerminated"]