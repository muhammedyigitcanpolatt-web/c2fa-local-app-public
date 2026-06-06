"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import styles from "./file-analysis-workbench.module.css";
import type { AnalysisPayload, AnalysisResponse } from "@/lib/analyze-file-types";
import type { ExportKind, ExportResponse } from "@/lib/export-evidence-types";

type WorkbenchState = {
  selectedFile: File | null;
  isDragging: boolean;
  isAnalyzing: boolean;
  analysisError: string | null;
  analysisResponse: AnalysisResponse | null;
  isExporting: boolean;
  exportKind: ExportKind | null;
  exportError: string | null;
  exportResponse: ExportResponse | null;
};

const initialState: WorkbenchState = {
  selectedFile: null,
  isDragging: false,
  isAnalyzing: false,
  analysisError: null,
  analysisResponse: null,
  isExporting: false,
  exportKind: null,
  exportError: null,
  exportResponse: null,
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) {
    return "Unavailable";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function toList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function resultLabel(response: AnalysisResponse | null): string {
  if (!response) {
    return "No analysis yet";
  }

  if (!response.ok && response.error?.code === "CORE_REPO_MISSING") {
    return "Core repo missing";
  }

  if (!response.ok && response.error?.code === "INVALID_FORM_DATA") {
    return "Invalid request";
  }

  if (!response.ok && response.error?.code === "MISSING_FILE") {
    return "No file selected";
  }

  if (!response.ok && response.error?.code === "COMMAND_FAILURE") {
    return "Command failure";
  }

  if (!response.ok && response.error?.code === "ANALYSIS_FAILED") {
    return "Analysis failed";
  }

  const payload = response.analysis?.payload;
  const status = payload?.c2pa?.status;

  if (response.analysis?.runtime_error) {
    return "Command failure";
  }

  if (response.analysis?.timed_out) {
    return "Timed out";
  }

  if (response.analysis?.parse_error) {
    return "Invalid JSON";
  }

  if (status === "verified") {
    return "Verified";
  }

  if (status === "not_present") {
    return "No manifest";
  }

  if (status === "invalid") {
    return "Tampered or invalid";
  }

  if (status === "error") {
    return "Malformed or unsupported";
  }

  if (status === "validator_unavailable") {
    return "Validator backend unavailable";
  }

  return payload?.result ?? "Analysis complete";
}

function analysisStatusHint(response: AnalysisResponse | null): string | null {
  if (!response) {
    return "Choose a local file to start a private analysis.";
  }

  if (!response.ok && response.error?.code === "CORE_REPO_MISSING") {
    return `The core repository is unavailable at ${response.core_repo_path}. Restore that path before retrying.`;
  }

  if (!response.ok && response.error?.code === "INVALID_FORM_DATA") {
    return "The upload request was malformed. Retry from the local app.";
  }

  if (!response.ok && response.error?.code === "MISSING_FILE") {
    return "No file was attached. Choose a local file before analyzing.";
  }

  if (!response.ok && response.error?.code === "COMMAND_FAILURE") {
    return "The core command started but exited with an error. Check the runtime and stderr output below.";
  }

  if (!response.ok && response.error?.code === "ANALYSIS_FAILED") {
    return "The file could not be analyzed locally. Review the technical evidence and raw JSON for details.";
  }

  if (response.analysis?.runtime_error) {
    return "The core command could not start. This is a runtime problem, not a successful analysis.";
  }

  if (response.analysis?.timed_out) {
    return "The core command timed out before it returned JSON.";
  }

  if (response.analysis?.parse_error) {
    return "The core command returned output that could not be parsed as JSON.";
  }

  const status = response.analysis?.payload?.c2pa?.status;
  if (status === "verified") {
    return "Validator-backed evidence was available for this file.";
  }

  if (status === "not_present") {
    return "No manifest was found. That is an evidence state, not a content judgment.";
  }

  if (status === "invalid") {
    return "The available evidence indicates a failed or tampered validation state.";
  }

  if (status === "error") {
    return "The file was malformed or unsupported by the current analyzer.";
  }

  if (status === "validator_unavailable") {
    return "The validator backend is unavailable in this runtime. That is expected on the default runtime and not a successful validator proof.";
  }

  if (response.cleanup.ok === false) {
    return "The analysis completed, but temporary file cleanup needs attention.";
  }

  return null;
}

function exportStatusHint(response: ExportResponse | null, exportError: string | null): string | null {
  if (exportError) {
    return exportError;
  }

  if (!response) {
    return null;
  }

  if (!response.ok && response.error?.code === "CORE_REPO_MISSING") {
    return `The core repository is unavailable at ${response.core_repo_path}. Restore that path before retrying exports.`;
  }

  if (!response.ok && response.error?.code === "INVALID_FORM_DATA") {
    return "The export request was malformed. Retry from the local app.";
  }

  if (!response.ok && response.error?.code === "MISSING_FILE") {
    return "No file was attached for export.";
  }

  if (!response.ok && response.error?.code === "INVALID_EXPORT_KIND") {
    return "The export kind was not recognized. Use receipt or report.";
  }

  if (!response.ok && response.error?.code === "CAPTURE_RECORD_MISSING") {
    return "The capture step did not produce a usable record path.";
  }

  if (!response.ok && response.error?.code === "CAPTURE_COMMAND_FAILURE") {
    return "The capture command started but exited with an error.";
  }

  if (!response.ok && response.error?.code === "CAPTURE_TIMED_OUT") {
    return "The capture command timed out before it returned JSON.";
  }

  if (!response.ok && response.error?.code === "CAPTURE_INVALID_JSON") {
    return "The capture command returned output that could not be parsed as JSON.";
  }

  if (!response.ok && response.error?.code === "RECEIPT_COMMAND_FAILURE") {
    return "The receipt command started but exited with an error.";
  }

  if (!response.ok && response.error?.code === "RECEIPT_TIMED_OUT") {
    return "The receipt command timed out before it returned JSON.";
  }

  if (!response.ok && (response.error?.code === "RECEIPT_INVALID_JSON" || response.error?.code === "RECEIPT_FILE_INVALID_JSON")) {
    return "The receipt export did not yield valid JSON.";
  }

  if (!response.ok && response.error?.code === "REPORT_COMMAND_FAILURE") {
    return "The report command started but exited with an error.";
  }

  if (!response.ok && response.error?.code === "REPORT_TIMED_OUT") {
    return "The report command timed out before it returned JSON.";
  }

  if (!response.ok && (response.error?.code === "REPORT_INVALID_JSON" || response.error?.code === "REPORT_FILE_INVALID_JSON")) {
    return "The report export did not yield valid JSON.";
  }

  if (!response.ok) {
    return response.error?.message ?? "The export failed.";
  }

  if (response.cleanup.ok === false) {
    return "The export completed, but temporary file cleanup needs attention.";
  }

  return null;
}

function downloadJson(fileName: string, artifact: Record<string, unknown>): void {
  const blob = new Blob([JSON.stringify(artifact, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function resultTone(response: AnalysisResponse | null): "positive" | "warning" | "critical" | "muted" {
  if (!response) {
    return "muted";
  }

  if (!response.ok) {
    return "critical";
  }

  if (response.analysis?.runtime_error || response.analysis?.timed_out || response.analysis?.parse_error) {
    return "critical";
  }

  const status = response.analysis?.payload?.c2pa?.status;
  if (status === "verified") {
    return "positive";
  }

  if (status === "not_present") {
    return "warning";
  }

  if (status === "invalid" || status === "error") {
    return "critical";
  }

  if (status === "validator_unavailable") {
    return "warning";
  }

  return "muted";
}

function summaryLine(payload: AnalysisPayload | null | undefined): string {
  const summary = payload?.c2pa?.human_summary?.summary_text;
  if (summary) {
    return summary;
  }

  return "No human summary is available in this result.";
}

function metadataStatus(payload: AnalysisPayload | null | undefined): string {
  const fields = payload?.metadata?.fields;
  if (!fields) {
    return "Not available in this result.";
  }

  const parts = [
    fields.format ? `Format: ${fields.format}` : null,
    fields.width && fields.height ? `Dimensions: ${fields.width}×${fields.height}` : null,
    `EXIF: ${fields.exif_present ? "present" : "not present"}`,
  ].filter(Boolean);

  return parts.length ? parts.join(" • ") : "Not available in this result.";
}

function AnalysisLayer({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.layer}>
      <p className={styles.layerLabel}>{label}</p>
      {children}
    </section>
  );
}

export function FileAnalysisWorkbench() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState<WorkbenchState>(initialState);

  const setSelectedFile = useCallback((file: File | null) => {
    setState((current) => ({
      ...current,
      selectedFile: file,
      analysisError: null,
      analysisResponse: null,
      exportError: null,
      exportResponse: null,
      exportKind: null,
    }));
  }, []);

  const handleFile = useCallback((file: File | null) => {
    if (!file) {
      return;
    }

    setSelectedFile(file);
  }, [setSelectedFile]);

  const analyzeSelectedFile = useCallback(async () => {
    if (!state.selectedFile) {
      setState((current) => ({ ...current, analysisError: "Choose a local file first." }));
      return;
    }

    setState((current) => ({ ...current, isAnalyzing: true, analysisError: null }));

    try {
      const formData = new FormData();
      formData.append("file", state.selectedFile);

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
        cache: "no-store",
      });

      const json = (await response.json()) as AnalysisResponse;

      setState((current) => ({
        ...current,
        isAnalyzing: false,
        analysisError: response.ok ? null : json.error?.message ?? "Analysis request failed.",
        analysisResponse: json,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to analyze the file.";
      setState((current) => ({
        ...current,
        isAnalyzing: false,
        analysisError: message,
      }));
    }
  }, [state.selectedFile]);

  const exportSelectedFile = useCallback(
    async (exportKind: ExportKind) => {
      if (!state.selectedFile) {
        setState((current) => ({ ...current, exportError: "Choose a local file first." }));
        return;
      }

      setState((current) => ({
        ...current,
        isExporting: true,
        exportError: null,
        exportResponse: null,
        exportKind,
      }));

      try {
        const formData = new FormData();
        formData.append("file", state.selectedFile);
        formData.append("kind", exportKind);

        const response = await fetch("/api/export", {
          method: "POST",
          body: formData,
          cache: "no-store",
        });

        const json = (await response.json()) as ExportResponse;

        if (response.ok && json.ok && json.artifact && json.download_name) {
          downloadJson(json.download_name, json.artifact);
        }

        setState((current) => ({
          ...current,
          isExporting: false,
          exportError: response.ok && json.ok ? null : json.error?.message ?? "Export request failed.",
          exportResponse: json,
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to export evidence.";
        setState((current) => ({
          ...current,
          isExporting: false,
          exportError: message,
        }));
      }
    },
    [state.selectedFile],
  );

  const payload = state.analysisResponse?.analysis?.payload;
  const humanSummary = payload?.c2pa?.human_summary;
  const c2paSummary = payload?.c2pa?.c2pa_summary;
  const advanced = payload?.c2pa?.c2pa_advanced;
  const warningText = state.analysisResponse?.cleanup.ok === false ? state.analysisResponse.cleanup.error ?? "Temporary file cleanup failed." : null;
  const hasRawJson = Boolean(state.analysisResponse);
  const analysisHint = analysisStatusHint(state.analysisResponse);
  const exportHint = exportStatusHint(state.exportResponse, state.exportError);
  const busy = state.isAnalyzing || state.isExporting;
  const exportReady = Boolean(state.analysisResponse);

  const fileInfo = useMemo(() => {
    if (!state.selectedFile) {
      return null;
    }

    return {
      name: state.selectedFile.name,
      sizeText: formatBytes(state.selectedFile.size),
      typeText: state.selectedFile.type || "Unknown type",
    };
  }, [state.selectedFile]);

  return (
    <section className={styles.panel} aria-label="file analysis">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>Local analysis</p>
          <h2>File Analysis</h2>
          <p className={styles.subtitle}>
            Choose a local file, send it only to the localhost Next.js server, and inspect the core analysis layers in
            a local preview view.
          </p>
        </div>

        <div className={styles.headerActions}>
          <span className={`${styles.pill} ${styles[resultTone(state.analysisResponse)]}`}>{resultLabel(state.analysisResponse)}</span>
          <span className={styles.localNote}>Local-only, temporary, and never uploaded to external services.</span>
        </div>
      </div>

      <section
        className={`${styles.dropZone} ${state.isDragging ? styles.dropZoneActive : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setState((current) => ({ ...current, isDragging: true }));
        }}
        onDragLeave={() => setState((current) => ({ ...current, isDragging: false }))}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files?.[0] ?? null;
          setState((current) => ({ ...current, isDragging: false }));
          handleFile(file);
        }}
        aria-label="local file picker"
      >
        <input
          ref={inputRef}
          className={styles.fileInput}
          type="file"
          onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
        />

        <div className={styles.dropContent}>
          <p className={styles.dropTitle}>Drop a local file here or choose one from disk.</p>
          <p className={styles.dropBody}>The file is written to a temporary ignored location only for this request.</p>
          <div className={styles.actionsRow}>
            <button className={styles.primaryButton} type="button" onClick={() => inputRef.current?.click()}>
              Choose file
            </button>
            <button className={styles.secondaryButton} type="button" onClick={() => void analyzeSelectedFile()} disabled={!state.selectedFile || busy}>
              {state.isAnalyzing ? "Analyzing..." : "Analyze file"}
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => setSelectedFile(null)}
              disabled={!state.selectedFile || busy}
            >
              Clear
            </button>
          </div>
          <p className={styles.boundaryText}>
            This result is file-level evidence. It does not prove that the media content is true or authentic.
          </p>
          {analysisHint ? <p className={styles.statusHint}>{analysisHint}</p> : null}
        </div>
      </section>

      <div className={styles.selectionRow}>
        <div>
          <span className={styles.metaLabel}>Selected file</span>
          <strong>{fileInfo?.name ?? "No file selected"}</strong>
        </div>
        <div>
          <span className={styles.metaLabel}>Size</span>
          <strong>{fileInfo?.sizeText ?? "Unavailable"}</strong>
        </div>
        <div>
          <span className={styles.metaLabel}>Type</span>
          <strong>{fileInfo?.typeText ?? "Unavailable"}</strong>
        </div>
      </div>

      {state.analysisError ? <p className={styles.errorBanner}>{state.analysisError}</p> : null}
      {warningText ? <p className={styles.warningBanner}>{warningText}</p> : null}

      <div className={styles.resultGrid}>
        <AnalysisLayer label="Human summary">
          <p className={styles.summaryText}>{summaryLine(payload)}</p>
          {humanSummary?.status ? <p className={styles.subtleLine}>Status: {humanSummary.status}</p> : null}
          <dl className={styles.detailList}>
            <div>
              <dt>Key findings</dt>
              <dd>
                {toList(humanSummary?.key_findings).length ? (
                  <ul>
                    {toList(humanSummary?.key_findings).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <span>Not available in this result.</span>
                )}
              </dd>
            </div>
            <div>
              <dt>Warnings</dt>
              <dd>
                {toList(humanSummary?.warnings).length ? (
                  <ul>
                    {toList(humanSummary?.warnings).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <span>Not available in this result.</span>
                )}
              </dd>
            </div>
          </dl>
        </AnalysisLayer>

        <AnalysisLayer label="Compact C2PA summary">
          {c2paSummary ? (
            <dl className={styles.detailList}>
              <div>
                <dt>Status</dt>
                <dd>{readText(c2paSummary.status) ?? "Not available in this result."}</dd>
              </div>
              <div>
                <dt>Validator</dt>
                <dd>{readText(c2paSummary.validator) ?? "Not available in this result."}</dd>
              </div>
              <div>
                <dt>Manifest present</dt>
                <dd>{typeof c2paSummary.manifest_present === "boolean" ? (c2paSummary.manifest_present ? "Yes" : "No") : "Not available in this result."}</dd>
              </div>
              <div>
                <dt>Signature valid</dt>
                <dd>{typeof c2paSummary.signature_valid === "boolean" ? (c2paSummary.signature_valid ? "Yes" : "No") : "Not available in this result."}</dd>
              </div>
              <div>
                <dt>Certificate chain</dt>
                <dd>{readText(c2paSummary.certificate_chain_status) ?? "Not available in this result."}</dd>
              </div>
              <div>
                <dt>Claim generator</dt>
                <dd>{readText(c2paSummary.claim_generator) ?? "Not available in this result."}</dd>
              </div>
              <div>
                <dt>Assertions</dt>
                <dd>{typeof c2paSummary.assertions_count === "number" ? String(c2paSummary.assertions_count) : "Not available in this result."}</dd>
              </div>
              <div>
                <dt>Ingredients</dt>
                <dd>{typeof c2paSummary.ingredients_count === "number" ? String(c2paSummary.ingredients_count) : "Not available in this result."}</dd>
              </div>
              <div>
                <dt>Fallback used</dt>
                <dd>{typeof c2paSummary.fallback_used === "boolean" ? (c2paSummary.fallback_used ? "Yes" : "No") : "Not available in this result."}</dd>
              </div>
              <div>
                <dt>Limitations</dt>
                <dd>
                  {toList(c2paSummary.limitations).length ? (
                    <ul>
                      {toList(c2paSummary.limitations).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <span>Not available in this result.</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Warnings</dt>
                <dd>
                  {toList(c2paSummary.warnings).length ? (
                    <ul>
                      {toList(c2paSummary.warnings).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <span>Not available in this result.</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Errors</dt>
                <dd>
                  {toList(c2paSummary.errors).length ? (
                    <ul>
                      {toList(c2paSummary.errors).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <span>Not available in this result.</span>
                  )}
                </dd>
              </div>
            </dl>
          ) : (
            <p className={styles.missingText}>Not available in this result.</p>
          )}
        </AnalysisLayer>

        <AnalysisLayer label="Technical evidence">
          {payload ? (
            <dl className={styles.detailList}>
              <div>
                <dt>Asset hash</dt>
                <dd>{payload.asset?.sha256 ?? "Not available in this result."}</dd>
              </div>
              <div>
                <dt>Asset size</dt>
                <dd>{typeof payload.asset?.byte_size === "number" ? `${formatBytes(payload.asset.byte_size)} (${payload.asset.byte_size} bytes)` : "Not available in this result."}</dd>
              </div>
              <div>
                <dt>Metadata</dt>
                <dd>{metadataStatus(payload)}</dd>
              </div>
              <div>
                <dt>C2PA signals</dt>
                <dd>{toList(payload.c2pa?.signals).length ? toList(payload.c2pa?.signals).join(" • ") : "Not available in this result."}</dd>
              </div>
              <div>
                <dt>C2PA warnings</dt>
                <dd>
                  {toList(payload.c2pa?.warnings).length ? (
                    <ul>
                      {toList(payload.c2pa?.warnings).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <span>Not available in this result.</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Core notice</dt>
                <dd>{payload.notice ?? "Not available in this result."}</dd>
              </div>
              <div>
                <dt>Core limitations</dt>
                <dd>
                  {toList(payload.limitations).length ? (
                    <ul>
                      {toList(payload.limitations).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <span>Not available in this result.</span>
                  )}
                </dd>
              </div>
            </dl>
          ) : (
            <p className={styles.missingText}>Not available in this result.</p>
          )}

          <details className={styles.detailsBlock} open={false}>
            <summary>Show advanced technical evidence</summary>
            {advanced ? (
              <div className={styles.detailsBody}>
                <dl className={styles.detailList}>
                  <div>
                    <dt>Active manifest ID</dt>
                    <dd>{readText(advanced.active_manifest_id) ?? "Not available in this result."}</dd>
                  </div>
                  <div>
                    <dt>Claim generator info</dt>
                    <dd>
                      {advanced.claim_generator_info?.length ? (
                        <ul>
                          {advanced.claim_generator_info.map((item, index) => (
                            <li key={`${item.name ?? "generator"}-${item.version ?? index}`}>{item.name ?? "Unknown"}{item.version ? ` ${item.version}` : ""}</li>
                          ))}
                        </ul>
                      ) : (
                        <span>Not available in this result.</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Validation warnings</dt>
                    <dd>
                      {toList(advanced.validation_warnings).length ? (
                        <ul>
                          {toList(advanced.validation_warnings).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <span>Not available in this result.</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Validation errors</dt>
                    <dd>
                      {toList(advanced.validation_errors).length ? (
                        <ul>
                          {toList(advanced.validation_errors).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <span>Not available in this result.</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Certificate summary</dt>
                    <dd>
                      {advanced.certificate_summary ? (
                        <ul>
                          <li>Algorithm: {advanced.certificate_summary.alg ?? "Unavailable"}</li>
                          <li>Issuer: {advanced.certificate_summary.issuer ?? "Unavailable"}</li>
                          <li>Serial: {advanced.certificate_summary.cert_serial_number ?? "Unavailable"}</li>
                        </ul>
                      ) : (
                        <span>Not available in this result.</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Raw manifest hash</dt>
                    <dd>{readText(advanced.raw_manifest_sanitized_hash) ?? "Not available in this result."}</dd>
                  </div>
                  <div>
                    <dt>Not fully interpreted</dt>
                    <dd>{typeof advanced.not_fully_interpreted_by_c2fa === "boolean" ? (advanced.not_fully_interpreted_by_c2fa ? "Yes" : "No") : "Not available in this result."}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <p className={styles.missingText}>Not available in this result.</p>
            )}
          </details>
        </AnalysisLayer>

        <AnalysisLayer label="Evidence export">
          <p className={styles.exportIntro}>
            Exports are evidence records for local review. They are not certification and do not prove that media content is true or authentic.
          </p>
          <div className={styles.exportActionsRow}>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => void exportSelectedFile("receipt")}
              disabled={!exportReady || busy}
            >
              {state.isExporting && state.exportKind === "receipt" ? "Exporting receipt..." : "Export receipt"}
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => void exportSelectedFile("report")}
              disabled={!exportReady || busy}
            >
              {state.isExporting && state.exportKind === "report" ? "Exporting report..." : "Export report"}
            </button>
          </div>
          {!exportReady ? <p className={styles.statusHint}>Run analysis first to unlock the export controls.</p> : null}
          {exportHint ? <p className={styles.statusHint}>{exportHint}</p> : null}
          {state.exportResponse?.ok ? (
            <dl className={styles.detailList}>
              <div>
                <dt>Export kind</dt>
                <dd>{state.exportResponse.export_kind}</dd>
              </div>
              <div>
                <dt>Download name</dt>
                <dd>{state.exportResponse.download_name ?? "Not available in this result."}</dd>
              </div>
              <div>
                <dt>Capture status</dt>
                <dd>{state.exportResponse.capture?.exit_code === 0 ? "Completed" : "Not available in this result."}</dd>
              </div>
              <div>
                <dt>Receipt status</dt>
                <dd>{state.exportResponse.receipt?.exit_code === 0 ? "Completed" : "Not available in this result."}</dd>
              </div>
              <div>
                <dt>Report status</dt>
                <dd>{state.exportResponse.report?.exit_code === 0 ? "Completed" : "Not available in this result."}</dd>
              </div>
              <div>
                <dt>Cleanup</dt>
                <dd>{state.exportResponse.cleanup.ok ? "Cleaned up" : state.exportResponse.cleanup.error ?? "Cleanup needs attention."}</dd>
              </div>
            </dl>
          ) : (
            <p className={styles.missingText}>{exportReady ? "No export has been generated yet." : "Exports stay locked until an analysis result exists."}</p>
          )}
        </AnalysisLayer>
      </div>

      <details className={styles.detailsBlock} open={false}>
        <summary>Show raw technical JSON</summary>
        {hasRawJson ? <pre className={styles.rawJson}>{JSON.stringify(state.analysisResponse, null, 2)}</pre> : <p className={styles.missingText}>No raw JSON is available yet.</p>}
      </details>
    </section>
  );
}
