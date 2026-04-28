-- Add CNB issue tracker support to feedback_project_configs

ALTER TABLE feedback_project_configs
  ADD COLUMN issue_tracker TEXT NOT NULL DEFAULT 'github',
  ADD COLUMN cnb_repo_namespace TEXT,
  ADD COLUMN cnb_repo_name TEXT,
  ADD COLUMN cnb_token TEXT;
