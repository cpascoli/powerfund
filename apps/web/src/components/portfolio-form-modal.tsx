"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, type ReactNode } from "react";

import styles from "./portfolio-form-modal.module.css";

type Props = {
  title: string;
  /** Where closing goes: the same portfolio view without the form parameter. */
  closeHref: string;
  children: ReactNode;
};

/**
 * A portfolio flow form (confirm a fill, plan a buy, sell, add a fill, cash
 * entry) shown as a modal over the page.
 *
 * The URL decides whether it is open: the page renders this only while a form
 * parameter such as `?confirm=<id>` is present, and closing navigates to the
 * same view without it. Nothing about open/closed lives in client state, which
 * is what broke the inline forms: a tab click set a `showForm` flag to false
 * that a later "Confirm" link could never set back.
 *
 * Native <dialog> with showModal() gives the backdrop, Escape to close and
 * focus containment without a library. A successful submit redirects to a URL
 * without the parameter, so the modal closes itself.
 */
export function PortfolioFormModal({ title, closeHref, children }: Props) {
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
      className={styles.modal}
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
          <h2 id={titleId}>{title}</h2>
          <button type="button" className={styles.close} aria-label="Close" onClick={close}>
            ×
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
