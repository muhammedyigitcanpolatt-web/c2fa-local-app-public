export type DoctorCheck = {
  name: string;
  status: string;
  blocking: boolean;
  details: string;
};

export type DoctorPayload = {
  ok?: boolean;
  action?: string;
  result?: string;
  private_pilot_ready?: boolean;
  python_version?: string;
  platform?: string;
  validator_backend?: boolean;
  checks?: DoctorCheck[];
  recommendations?: string[];
  notice?: string;
  limitations?: string[];
};

export type DoctorRun = {
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
  payload: DoctorPayload | null;
  parse_error?: string;
  runtime_error?: string;
  skipped_reason?: string;
};

export type ValidatorStatusResponse = {
  ok: boolean;
  checked_at: string;
  core_repo_path: string;
  validator_venv_path: string;
  default_runtime: DoctorRun;
  validator_runtime: DoctorRun;
  error?: {
    code: string;
    message: string;
    details?: string;
  };
};
