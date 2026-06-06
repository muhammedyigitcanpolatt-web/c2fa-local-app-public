import styles from "./page.module.css";
import { FileAnalysisWorkbench } from "@/components/file-analysis-workbench";
import { ValidatorStatusPanel } from "@/components/validator-status-panel";
import { collectValidatorStatus } from "@/lib/validator-doctor";

export const dynamic = "force-dynamic";

export default async function Home() {
  const initialValidatorStatus = await collectValidatorStatus();

  return (
    <main className={styles.shell}>
      <section className={styles.frame} aria-label="C2FA Local Operator UI">
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <p className={styles.kicker}>Local-first preview surface</p>
            <h1>C2FA Local</h1>
            <p className={styles.subtitle}>
              A local-first experimental workspace for checking validator readiness, file-level integrity evidence,
              local evidence exports, and human-readable explanations without leaving localhost.
            </p>
          </div>

          <div className={styles.badges} aria-label="environment status">
            <span className={styles.badgePrimary}>Local-first / Experimental</span>
            <span className={styles.badgeMuted}>Local-only</span>
          </div>
        </header>

        <section className={styles.notice} aria-label="claim boundary">
          <h2>Claim boundary</h2>
          <p>
            This tool verifies file-level integrity evidence and available C2PA-related metadata. It does not prove
            that media content is true or authentic.
          </p>
        </section>

        <ValidatorStatusPanel initialData={initialValidatorStatus} />

        <FileAnalysisWorkbench />

        <footer className={styles.footer}>
          <p className={styles.footerNote}>v0.1 is a local-first experimental preview.</p>
          <p className={styles.footerNoteSecondary}>
            No cloud upload, no auth, no payment, and no production claim are part of this phase.
          </p>
          <p className={styles.footerNoteSecondary}>Status: Public-safe source preview — not production-ready.</p>
        </footer>
      </section>
    </main>
  );
}
