"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import styles from "@/app/admin/page.module.css";

type AdminModalProps = {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
};

export function AdminModal({ title, description, onClose, children, footer, wide = false }: AdminModalProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className={styles.modalBackdrop} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`${styles.modalPanel} ${wide ? styles.modalWide : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>{title}</h2>
            {description && <p className={styles.modalDescription}>{description}</p>}
          </div>
          <button className={styles.iconButton} onClick={onClose} aria-label="닫기" title="닫기">
            <X size={18} />
          </button>
        </header>
        <div className={styles.modalBody}>{children}</div>
        {footer && <footer className={styles.modalFooter}>{footer}</footer>}
      </section>
    </div>
  );
}
