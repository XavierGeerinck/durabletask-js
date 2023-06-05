class _ActivityExecutor:
    def __init__(self, registry: _Registry, logger: logging.Logger):
        self._registry = registry
        self._logger = logger

    def execute(self, orchestration_id: str, name: str, task_id: int, encoded_input: Union[str, None]) -> Union[str, None]:
        """Executes an activity function and returns the serialized result, if any."""
        self._logger.debug(f"{orchestration_id}/{task_id}: Executing activity '{name}'...")
        fn = self._registry.get_activity(name)
        if not fn:
            raise ActivityNotRegisteredError(f"Activity function named '{name}' was not registered!")

        activity_input = shared.from_json(encoded_input) if encoded_input else None
        ctx = task.ActivityContext(orchestration_id, task_id)

        # Execute the activity function
        activity_output = fn(ctx, activity_input)

        encoded_output = shared.to_json(activity_output) if activity_output is not None else None
        chars = len(encoded_output) if encoded_output else 0
        self._logger.debug(
            f"{orchestration_id}/{task_id}: Activity '{name}' completed successfully with {chars} char(s) of encoded output.")
        return encoded_output

