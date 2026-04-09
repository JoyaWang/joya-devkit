/**
 * Project context error types.
 *
 * Standardized error codes for project resolution failures.
 */

export type ProjectContextErrorCode =
  | "project_not_registered"
  | "project_inactive"
  | "service_binding_missing";

export class ProjectContextError extends Error {
  readonly code: ProjectContextErrorCode;
  readonly statusCode: number;
  readonly projectKey: string;
  readonly runtimeEnv?: string;
  readonly serviceType?: string;

  constructor(params: {
    code: ProjectContextErrorCode;
    message: string;
    statusCode: number;
    projectKey: string;
    runtimeEnv?: string;
    serviceType?: string;
  }) {
    super(params.message);
    this.name = "ProjectContextError";
    this.code = params.code;
    this.statusCode = params.statusCode;
    this.projectKey = params.projectKey;
    this.runtimeEnv = params.runtimeEnv;
    this.serviceType = params.serviceType;
  }
}

/**
 * Create a project_not_registered error (HTTP 422).
 */
export function projectNotRegistered(projectKey: string): ProjectContextError {
  return new ProjectContextError({
    code: "project_not_registered",
    message: `Project "${projectKey}" is not registered`,
    statusCode: 422,
    projectKey,
  });
}

/**
 * Create a project_inactive error (HTTP 403).
 */
export function projectInactive(projectKey: string): ProjectContextError {
  return new ProjectContextError({
    code: "project_inactive",
    message: `Project "${projectKey}" is inactive`,
    statusCode: 403,
    projectKey,
  });
}

/**
 * Create a service_binding_missing error (HTTP 422).
 */
export function serviceBindingMissing(
  projectKey: string,
  runtimeEnv: string,
  serviceType: string,
): ProjectContextError {
  return new ProjectContextError({
    code: "service_binding_missing",
    message: `Project "${projectKey}" has no binding for runtimeEnv "${runtimeEnv}" and service "${serviceType}"`,
    statusCode: 422,
    projectKey,
    runtimeEnv,
    serviceType,
  });
}
