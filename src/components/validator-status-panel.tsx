"use client";

import { useCallback, useMemo, useState } from "react";
import styles from "./validator-status-panel.module.css";
import type { DoctorRun, ValidatorStatusResponse } from "@/lib/validator-status-types";

type PanelState = {
  loading: boolean;
  error: string | null;
  data: ValidatorStatusResponse | null;
};

function getInitialState(initialData: ValidatorStatusResponse | null): PanelState {
  return {
    loading: false,
    error: initialData?.ok === false ? initialData.error?.message ?? "Unable to load validator status." : null,
    data: initialData,
  };
}

const loadingState: PanelState = {
  loading: true,
  error: null,
  data: null,
};

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "Unavailable";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusTone(run: DoctorRun): "positive" | "warning" | "critical" | "muted" {
  const result = run.payload?.result ?? "UNKNOWN";

  if (run.runtime_error || run.parse_error || run.timed_out) {
    return "critical";
  }

  if (result === "READY_FOR_PRIVATE_PILOT") {
    return "positive";
  }

  if (result === "NEEDS_ATTENTION") {
    return "warning";
  }

  if (!run.available || run.skipped_reason) {
    return "muted";
  }

  return "warning";
}

function statusLabel(run: DoctorRun): string {
  if (run.runtime_error) {
    return "Runtime error";
  }

  if (run.parse_error) {
    return "Invalid JSON";
  }

  if (run.timed_out) {
    return "Timed out";
  }

  if (!run.available && run.skipped_reason) {
    return "Skipped";
  }

  return run.payload?.result ?? "Unavailable";
}

function RuntimeBlock({
  title,
  run,
}: {
  title: string;
  run: DoctorRun;
}) {
  const tone = statusTone(run);

  return (
    <section className={styles.runtimeBlock} aria-label={title}>
      <div className={styles.runtimeHeader}>
        <div>
          <p className={styles.runtimeKicker}>{title}</p>
          <h3>{statusLabel(run)}</h3>
        </div>
        <span className={`${styles.pill} ${styles[tone]}`}>{tone === "positive" ? "Ready" : tone === "warning" ? "Needs attention" : tone === "critical" ? "Error" : "Not run"}</span>
      </div>

      <dl className={styles.metaList}>
        <div>
          <dt>Command</dt>
          <dd>{run.command}</dd>
        </div>
        <div>
          <dt>Exit code</dt>
          <dd>{run.exit_code ?? "n/a"}</dd>
        </div>
        <div>
          <dt>Python</dt>
          <dd>{run.payload?.python_version ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt>Validator backend</dt>
          <dd>{typeof run.payload?.validator_backend === "boolean" ? (run.payload.validator_backend ? "Available" : "Unavailable") : "n/a"}</dd>
        </div>
        <div>
          <dt>Private pilot readiness</dt>
          <dd>{typeof run.payload?.private_pilot_ready === "boolean" ? (run.payload.private_pilot_ready ? "Yes" : "No") : "n/a"}</dd>
        </div>
        <div>
          <dt>Checked</dt>
          <dd>{formatTimestamp(run.finished_at)}</dd>
        </div>
      </dl>

      {run.skipped_reason ? (
        <p className={styles.notice}>{run.skipped_reason}</p>
      ) : null}
      {run.runtime_error ? <p className={styles.errorText}>{run.runtime_error}</p> : null}
      {run.parse_error ? <p className={styles.errorText}>{run.parse_error}</p> : null}
      {run.timed_out ? <p className={styles.errorText}>Command timed out before valid JSON was returned.</p> : null}

      {run.payload?.recommendations?.length ? (
        <div className={styles.listBlock}>
          <p className={styles.listLabel}>Recommendations</p>
          <ul>
            {run.payload.recommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {run.payload?.limitations?.length ? (
        <div className={styles.listBlock}>
          <p className={styles.listLabel}>Limitations</p>
          <ul>
            {run.payload.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function ValidatorStatusPanel({ initialData }: { initialData: ValidatorStatusResponse | null }) {
  const [state, setState] = useState<PanelState>(() => (initialData ? getInitialState(initialData) : loadingState));

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/validator-status", { cache: "no-store" });

      const json = (await response.json()) as ValidatorStatusResponse;
      setState({
        loading: false,
        error: !json.ok || !response.ok ? json.error?.message ?? "Unable to load validator status." : null,
        data: json,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load validator status.";
      setState({
        loading: false,
        error: message,
        data: null,
      });
    }
  }, []);

  const handleRefresh = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }));
    void loadStatus();
  }, [loadStatus]);

  const overallTone = useMemo(() => {
    if (state.loading) {
      return "muted";
    }

    if (state.error) {
      return "critical";
    }

    if (state.data?.validator_runtime.payload?.result === "READY_FOR_PRIVATE_PILOT") {
      return "positive";
    }

    if (state.data?.default_runtime.payload?.result === "NEEDS_ATTENTION") {
      return "warning";
    }

    return "muted";
  }, [state.data, state.error, state.loading]);

  const overallLabel = state.loading
    ? "Refreshing"
    : state.error
      ? "Needs attention"
      : state.data?.validator_runtime.payload?.result === "READY_FOR_PRIVATE_PILOT"
        ? "Validator ready"
        : state.data?.default_runtime.payload?.result ?? "Unavailable";

  return (
    <section className={styles.panel} aria-label="validator status">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>Connected panel</p>
          <h2>Validator Status</h2>
          <p className={styles.subtitle}>
            This panel calls the core `validator-doctor` command locally and keeps the default runtime separate from
            the validator-enabled Python 3.11 lane.
          </p>
        </div>

        <div className={styles.headerActions}>
          <span className={`${styles.pill} ${styles[overallTone]}`}>{overallLabel}</span>
          <button className={styles.refreshButton} onClick={handleRefresh} type="button" disabled={state.loading}>
            {state.loading ? "Refreshing..." : "Refresh status"}
          </button>
        </div>
      </div>

      <div className={styles.metaRow}>
        <div>
          <span className={styles.metaLabel}>Core repo</span>
          <strong>{state.data?.core_repo_path ?? "Configured via C2FA_CORE_PATH"}</strong>
        </div>
        <div>
          <span className={styles.metaLabel}>Validator venv</span>
          <strong>{state.data?.validator_venv_path ?? "Derived from C2FA_CORE_PATH"}</strong>
        </div>
        <div>
          <span className={styles.metaLabel}>Last check</span>
          <strong>{formatTimestamp(state.data?.checked_at ?? null)}</strong>
        </div>
      </div>

      {state.error ? <p className={styles.errorBanner}>{state.error}</p> : null}

      {state.data ? (
        <div className={styles.runtimeGrid}>
          <RuntimeBlock title="Default runtime" run={state.data.default_runtime} />
          <RuntimeBlock title="Validator runtime" run={state.data.validator_runtime} />
        </div>
      ) : (
        <div className={styles.loadingState}>{state.loading ? "Loading validator status..." : "No status available."}</div>
      )}

      {state.data?.default_runtime.payload?.notice ? <p className={styles.noticeFooter}>{state.data.default_runtime.payload.notice}</p> : null}
    </section>
  );
}
