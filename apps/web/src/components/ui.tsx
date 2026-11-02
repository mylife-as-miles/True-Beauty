import { createPortal } from "react-dom";
import { X, ArrowUpRight, Check, LoaderCircle } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <path
        d="M20 1C20 13 13 20 1 20c12 0 19 7 19 19 0-12 7-19 19-19C27 20 20 13 20 1Z"
        fill="currentColor"
      />
      <path d="M20 9v22M9 20h22" stroke="var(--ground)" strokeWidth=".7" />
    </svg>
  );
}
export function IconButton({
  label,
  children,
  onClick,
  className = "",
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      className={`icon-button ${className}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
let activeDialogs = 0;
let inertRestore: Array<{ element: HTMLElement; value: boolean }> = [];
let previousBodyOverflow = "";
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    closeRef = useRef(onClose),
    previousFocus = useRef(document.activeElement as HTMLElement);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = previousFocus.current;
    if (activeDialogs++ === 0) {
      inertRestore = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".topbar,.workspace,.app-footer,.skip-link",
        ),
      ).map((element) => ({ element, value: element.inert }));
      inertRestore.forEach(({ element }) => {
        element.inert = true;
      });
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    const isTop = () =>
      Array.from(document.querySelectorAll('.modal[aria-modal="true"]')).at(
        -1,
      ) === ref.current;
    const focusable = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button,input,select,textarea,summary,a[href],[tabindex],[contenteditable="true"]',
        ) ?? [],
      ).filter(
        (element) =>
          !element.matches(':disabled,[aria-disabled="true"]') &&
          element.tabIndex >= 0 &&
          !element.closest("[hidden],[inert]") &&
          element.getClientRects().length > 0 &&
          getComputedStyle(element).visibility !== "hidden",
      );
    const focusFirst = () => {
      (focusable()[0] ?? ref.current)?.focus();
    };
    const initial = focusable().find((element) =>
      element.matches(
        'input:not([type="checkbox"]):not([type="file"]),textarea',
      ),
    );
    (initial ?? focusable()[0] ?? ref.current)?.focus();
    const handler = (event: KeyboardEvent) => {
      if (!isTop()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) {
        event.preventDefault();
        ref.current?.focus();
        return;
      }
      // Explicit traversal also handles Safari's default full-keyboard-access
      // mode, which can otherwise skip buttons and move focus to the page.
      event.preventDefault();
      const index = elements.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey
        ? index <= 0
          ? elements.length - 1
          : index - 1
        : index < 0 || index === elements.length - 1
          ? 0
          : index + 1;
      elements[next].focus();
    };
    const contain = (event: FocusEvent) => {
      if (isTop() && !ref.current?.contains(event.target as Node)) focusFirst();
    };
    document.addEventListener("keydown", handler);
    document.addEventListener("focusin", contain);
    return () => {
      document.removeEventListener("keydown", handler);
      document.removeEventListener("focusin", contain);
      if (--activeDialogs === 0) {
        inertRestore.forEach(({ element, value }) => {
          element.inert = value;
        });
        inertRestore = [];
        document.body.style.overflow = previousBodyOverflow;
      }
      if (prev?.isConnected && !prev.closest("[inert]")) prev.focus();
    };
  }, []);
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`modal ${wide ? "wide" : ""}`}
        ref={ref}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <IconButton label="Close dialog" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Mark size={36} />
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function SectionTitle({
  overline,
  title,
  children,
}: {
  overline?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        {overline && <p className="subtle-label">{overline}</p>}
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}
export function ActionLink({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="text-action" onClick={onClick}>
      {children}
      <ArrowUpRight size={16} />
    </button>
  );
}
export function Status({
  loading,
  children,
}: {
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <span className="status-text">
      {loading ? (
        <LoaderCircle className="spin" size={13} />
      ) : (
        <Check size={13} />
      )}{" "}
      {children}
    </span>
  );
}
