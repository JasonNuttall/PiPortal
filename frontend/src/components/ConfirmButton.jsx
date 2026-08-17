import { useState, useEffect, useRef } from "react";

/**
 * A destructive action that asks for confirmation in place.
 *
 * Replaces window.confirm, which blocks the page, ignores the theme and gives
 * no room to say what is about to happen. Reverts on its own so a stray click
 * does not leave the UI armed.
 */
const REVERT_MS = 4000;

const ConfirmButton = ({
  onConfirm,
  title,
  confirmLabel = "Confirm",
  children,
  className = "",
  confirmClassName = "",
}) => {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!armed) return undefined;
    timerRef.current = setTimeout(() => setArmed(false), REVERT_MS);
    return () => clearTimeout(timerRef.current);
  }, [armed]);

  if (armed) {
    return (
      <span className="flex items-center gap-1">
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setArmed(false);
            onConfirm();
          }}
          className={`glass-pill text-[9px] text-red-300 border-red-500/40 hover:bg-red-900/30 transition-colors ${confirmClassName}`}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setArmed(false);
          }}
          className="glass-pill text-[9px] text-ctext-dim hover:text-ctext transition-colors"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setArmed(true);
      }}
      title={title}
      className={className}
    >
      {children}
    </button>
  );
};

export default ConfirmButton;
