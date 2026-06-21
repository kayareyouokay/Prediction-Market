/* ──────────────────────────────────────────────
   Kairo — Toast Notification System
   Provides toast() utility and <ToastContainer />
   ────────────────────────────────────────────── */

import {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import "./Toast.css";

type ToastVariant = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
  exiting: boolean;
}

type ToastListener = (toasts: ToastItem[]) => void;

/* ── Global toast store ── */
let toasts: ToastItem[] = [];
let listeners: ToastListener[] = [];
let toastIdCounter = 0;

function emitChange() {
  listeners.forEach((fn) => fn([...toasts]));
}

function addToast(
  message: string,
  variant: ToastVariant = "info",
  duration: number = 4000,
) {
  const id = `toast-${++toastIdCounter}`;
  toasts = [...toasts, { id, message, variant, duration, exiting: false }];
  emitChange();

  setTimeout(() => {
    toasts = toasts.map((t) => (t.id === id ? { ...t, exiting: true } : t));
    emitChange();
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
      emitChange();
    }, 300);
  }, duration);
}

export const toast = {
  success: (message: string) => addToast(message, "success"),
  error: (message: string) => addToast(message, "error"),
  info: (message: string) => addToast(message, "info"),
  warning: (message: string) => addToast(message, "warning"),
};

function useToastStore(): ToastItem[] {
  const [state, setState] = useState<ToastItem[]>([]);

  useEffect(() => {
    listeners.push(setState);
    return () => {
      listeners = listeners.filter((fn) => fn !== setState);
    };
  }, []);

  return state;
}

/* ── Icons ── */
function SuccessIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5 8l2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5.5 5.5l5 5M10.5 5.5l-5 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 7v4M8 5.5V5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 2L14.5 13H1.5L8 2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M8 6.5v3M8 11v.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

const iconMap: Record<ToastVariant, () => JSX.Element> = {
  success: SuccessIcon,
  error: ErrorIcon,
  info: InfoIcon,
  warning: WarningIcon,
};

/* ── ToastContainer ── */
export function ToastContainer() {
  const items = useToastStore();

  if (items.length === 0) return null;

  return (
    <div
      className="toast-container"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {items.map((item) => {
        const Icon = iconMap[item.variant];
        return (
          <div
            key={item.id}
            className={`toast toast--${item.variant}${item.exiting ? " toast--exiting" : ""}`}
            role="alert"
          >
            <span className="toast__icon">
              <Icon />
            </span>
            <span className="toast__message">{item.message}</span>
          </div>
        );
      })}
    </div>
  );
}
