import { TaskFailedError } from "./exception/task-failed-error";
import { CompositeTask } from "./composite-task";
import { WhenAllTask } from "./when-all-task";

/**
 * Returns a task that completes when all of the provided tasks complete or when one of the tasks fail
 *
 * @param tasks the tasks to wait for
 * @returns {WhenAllTask} a task that completes when all of the provided tasks complete or when one of the tasks fail
 */
export function whenAll<T>(tasks: Task<T>[]): WhenAllTask<T> {
  return new WhenAllTask(tasks);
}

/**
 * Returns a task that completes when any of the provided tasks complete or fail
 *
 * @param tasks
 * @returns
 */
export function whenAny(tasks: Task<any>[]): WhenAllTask<any> {
  return new WhenAllTask(tasks);
}

/**
 * Returns the name of the provided function
 *
 * @param fn
 * @returns
 */
export function getName(fn: Function): string {
  const name = fn.name;

  if (!name) {
    throw new Error("Cannot infer a name from a lambda function. Please provide a name explicitly.");
  }

  return name;
}

/**
 * Abstract base class for asynchronous tasks in a durable orchestration.
 */
export class Task<T> {
  _result: T | undefined;
  _exception: TaskFailedError | undefined;
  _parent: CompositeTask<T> | undefined;
  _isComplete: boolean = false;

  constructor() {
    this._isComplete = false;
    this._exception = undefined;
    this._parent = undefined;
  }

  /**
   * Returns true if the task has completed, false otherwise
   */
  get isComplete(): boolean {
    return this._isComplete;
  }

  /**
   * Returns true if the task has failed, false otherwise
   */
  get isFailed(): boolean {
    return this._exception != undefined;
  }

  /**
   * Get the result of the task
   */
  getResult(): T {
    if (!this._isComplete) {
      throw new Error("Task is not complete");
    }

    if (this._exception) {
      throw this._exception;
    }

    return this._result as T;
  }

  /**
   * Get the exception that caused the task to fail
   */
  getException(): TaskFailedError {
    if (!this._exception) {
      throw new Error("Task did not fail");
    }

    return this._exception;
  }
}
