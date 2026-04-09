/**
 * ProjectContextResolver — resolves projectKey + serviceType to a binding.
 *
 * Queries the database for the project manifest and service binding,
 * validates the project status, and returns the resolved context.
 */

import type { ProjectManifest, ProjectServiceBinding, ResolvedProjectContext } from "./types.js";
import {
  projectNotRegistered,
  projectInactive,
  serviceBindingMissing,
} from "./errors.js";

/** Minimal database client interface — decoupled from Prisma specifics. */
export interface ProjectDatabaseClient {
  projectManifest: {
    findUnique(args: { where: { projectKey: string } }): Promise<ProjectManifestRow | null>;
  };
  projectServiceBinding: {
    findUnique(args: { where: { projectKey_serviceType: { projectKey: string; serviceType: string } } }): Promise<ProjectServiceBindingRow | null>;
  };
}

export interface ProjectManifestRow {
  projectKey: string;
  displayName: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectServiceBindingRow {
  projectKey: string;
  serviceType: string;
  provider: string;
  config: string;
  createdAt: Date;
  updatedAt: Date;
}

function rowToManifest(row: ProjectManifestRow): ProjectManifest {
  return {
    projectKey: row.projectKey,
    displayName: row.displayName,
    status: row.status as ProjectManifest["status"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToBinding(row: ProjectServiceBindingRow): ProjectServiceBinding {
  return {
    projectKey: row.projectKey,
    serviceType: row.serviceType,
    provider: row.provider,
    config: row.config,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class ProjectContextResolver {
  private readonly db: ProjectDatabaseClient;

  constructor(db: ProjectDatabaseClient) {
    this.db = db;
  }

  /**
   * Resolve a projectKey + serviceType to a full project context.
   *
   * Throws ProjectContextError on resolution failures:
   * - project_not_registered (422): no manifest found
   * - project_inactive (403): manifest status is not "active"
   * - service_binding_missing (422): no binding for the service type
   */
  async resolve(projectKey: string, serviceType: string): Promise<ResolvedProjectContext> {
    const manifestRow = await this.db.projectManifest.findUnique({
      where: { projectKey },
    });

    if (!manifestRow) {
      throw projectNotRegistered(projectKey);
    }

    if (manifestRow.status !== "active") {
      throw projectInactive(projectKey);
    }

    const bindingRow = await this.db.projectServiceBinding.findUnique({
      where: {
        projectKey_serviceType: { projectKey, serviceType },
      },
    });

    if (!bindingRow) {
      throw serviceBindingMissing(projectKey, serviceType);
    }

    return {
      manifest: rowToManifest(manifestRow),
      binding: rowToBinding(bindingRow),
    };
  }
}
