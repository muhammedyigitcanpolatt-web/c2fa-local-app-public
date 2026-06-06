export type AnalysisHumanSummary = {
  artifact_type?: string;
  artifact_id?: string | null;
  summary_text?: string;
  key_findings?: string[];
  warnings?: string[];
  status?: string;
};

export type AnalysisC2PASummary = {
  status?: string;
  validator?: string;
  manifest_present?: boolean | null;
  signature_valid?: boolean | null;
  certificate_chain_status?: string | null;
  claim_generator?: string | null;
  assertions_count?: number;
  ingredients_count?: number;
  warnings?: string[];
  errors?: string[];
  fallback_used?: boolean;
  limitations?: string[];
};

export type AnalysisC2PAAdvanced = {
  active_manifest_id?: string | null;
  claim_generator_info?: Array<{ name?: string; version?: string }>;
  ingredients_summary?: { count?: number; items?: unknown[] };
  assertions_summary?: { count?: number; items?: unknown[] };
  validation_warnings?: string[];
  validation_errors?: string[];
  certificate_summary?: {
    alg?: string;
    issuer?: string;
    cert_serial_number?: string;
  };
  unknown_fields_present?: boolean;
  unknown_field_names?: string[];
  raw_manifest_available?: boolean;
  raw_manifest_sanitized_hash?: string | null;
  raw_manifest_sanitized?: unknown;
  raw_manifest_store_sanitized?: unknown;
  not_fully_interpreted_by_c2fa?: boolean;
};

export type AnalysisPayload = {
  ok?: boolean;
  action?: string;
  result?: string;
  asset?: {
    sha256?: string;
    byte_size?: number;
  };
  metadata?: {
    ok?: boolean;
    fields?: {
      format?: string | null;
      width?: number | null;
      height?: number | null;
      exif_present?: boolean;
      camera_make?: string | null;
      camera_model?: string | null;
      software?: string | null;
    };
    warnings?: string[];
  };
  c2pa?: {
    ok?: boolean;
    status?: string;
    validator?: string;
    manifest_present?: boolean | null;
    has_manifest?: boolean | null;
    signature_valid?: boolean | null;
    certificate_chain_status?: string | null;
    claim_generator?: string | null;
    claim_generator_info?: Array<{ name?: string; version?: string }> | null;
    assertions_count?: number;
    ingredients_count?: number;
    fallback_used?: boolean;
    errors?: string[];
    limitations?: string[];
    raw_manifest_summary?: {
      active_manifest?: string;
      manifest_count?: number;
      validation_state?: unknown;
    } | null;
    c2pa_summary?: AnalysisC2PASummary | null;
    c2pa_advanced?: AnalysisC2PAAdvanced | null;
    human_summary?: AnalysisHumanSummary | null;
    signals?: string[];
    warnings?: string[];
  };
  notice?: string;
  limitations?: string[];
};

export type AnalysisRun = {
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
  payload: AnalysisPayload | null;
  parse_error?: string;
  runtime_error?: string;
  skipped_reason?: string;
};

export type AnalysisFileInfo = {
  name: string;
  size: number;
  type: string | null;
  last_modified: number | null;
};

export type AnalysisCleanup = {
  attempted: boolean;
  ok: boolean;
  error?: string;
};

export type AnalysisResponse = {
  ok: boolean;
  checked_at: string;
  core_repo_path: string;
  validator_venv_path: string;
  runtime_used: "default" | "validator";
  file: AnalysisFileInfo | null;
  analysis: AnalysisRun | null;
  cleanup: AnalysisCleanup;
  error?: {
    code: string;
    message: string;
    details?: string;
  };
};
