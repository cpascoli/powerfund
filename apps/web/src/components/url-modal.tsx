"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, type ReactNode } from "react";

import styles from "./url-modal.module.css";

type Props = {
  title: string;
  /** Where closing goes: the same view without the parameter that opened it. */
  closeHref: string;
  /** Small line above the title, e.g. a kind badge. */
  eyebrow?: ReactNode;
  /** "form" (default) for a portfolio flow form; "wide" for reading a record. */
  size?: "form" | "wide";
  children: ReactNode;
};

/**
 * A modal whose open state is the URL: a portfolio flow form (`?confirm=<id>`,
 * `?plan=…`) or a Memory record (`?open=<id>`).
 *
 * The page renders this only while its parameter is present, and closing
 * navigates to the same view without it. Nothing about open/closed lives in
 * client state, which is what broke the inline portfolio forms: a tab click
 * set a `showForm` flag to false that a later "Confirm" link could never set
 * back.
 *
 * Native <dialog> with showModal() gives the backdrop, Escape to close and
 * focus containment without a library. A successful submit redirects to a URL
 * without the parameter, so the modal closes itself.
 */
export function UrlModal({ title, closeHref, eyebrow, size = "form", children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function close() {
    router.replace(closeHref, { scroll: false });
  }

  return (
    <dialog
      ref={ref}
      className={`${styles.modal}${size === "wide" ? ` ${styles.wide}` : ""}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape: let the URL close it, so history and the server agree.
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (event.target === ref.current) close();
      }}
    >
      <div className={styles.inner}>
        <header className={styles.header}>
          <div>
            {eyebrow}
            <h2 id={titleId}>{title}</h2>
          </div>
          <button type="button" className={styles.close} aria-label="Close" onClick={close}>
            ×
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
