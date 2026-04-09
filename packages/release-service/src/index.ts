/**
 * Release Service package.
 *
 * Phase 1 skeleton — types and contract only, no implementation yet.
 */

export interface Release {
  id: string;
  projectKey: string;
  platform: 'ios' | 'android' | 'desktop';
  env: 'dev' | 'staging' | 'prod';
  appVersion: string;
  buildNumber: number;
  semanticVersion: string;
  distributionTarget: string;
  distributionUrl: string;
  artifactObjectKey?: string;
  releaseNotes?: string;
  changelog?: string;
  forceUpdate: boolean;
  minSupportedVersion?: string;
  rolloutStatus: 'draft' | 'active' | 'paused' | 'completed';
  createdBy: string;
  createdAt: string;
}

export interface CreateReleaseInput {
  projectKey: string;
  platform: Release['platform'];
  env: Release['env'];
  appVersion: string;
  buildNumber: number;
  semanticVersion: string;
  distributionTarget: string;
  distributionUrl: string;
  artifactObjectKey?: string;
  releaseNotes?: string;
  changelog?: string;
}
