export type ExportKind = "receipt" | "report";

export type ExportFileInfo = {
  name: string;
  size: number;
  type: string | null;
  last_modified: number | null;
};

export type ExportCommandRun = {
  label: "default" | "validator";
  command: string;
  cwd: string;
  available: boolean;
  exit_code: number | null;
  timed_out: boolean;
  started_at: string;
  finished_at: string;
  raw_stdout: string;
  raw_stderr: string;
  payload: unknown | null;
  parse_error?: string;
  runtime_error?: string;
};

export type ExportResponse = {
  ok: boolean;
  checked_at: string;
  core_repo_path: string;
  validator_venv_path: string;
  runtime_used: "default" | "validator";
  export_kind: ExportKind;
  file: ExportFileInfo | null;
  capture: ExportCommandRun | null;
  receipt: ExportCommandRun | null;
  report: ExportCommandRun | null;
  artifact: Record<string, unknown> | null;
  download_name: string | null;
  cleanup: {
    attempted: boolean;
    ok: boolean;
    error?: string;
  };
  error?: {
    code: string;
    message: string;
    details?: string;
  };
};
