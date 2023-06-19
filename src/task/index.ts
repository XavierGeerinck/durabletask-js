import { WhenAllTask } from "./when-all-task";
import { Task } from "./task";

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