import { X, ExternalLink } from "lucide-react";
import { useDialog } from "../../hooks/useDialog";
import { moduleImageUrl } from "../../api/api";

/**
 * An item's detail, opened from any view.
 *
 * Detail is not a view of its own: browsing and inspecting are different
 * activities, so a list, a grid and a calendar all open the same sheet rather
 * than one of them being the "detailed" layout.
 */
const DetailSheet = ({ moduleId, item, onClose }) => {
  const ref = useDialog(onClose);
  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        onClick={(event) => event.stopPropagation()}
        className="glass-card w-full max-w-md max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-glass-border">
          <div className="min-w-0">
            <h2 className="font-spectral italic text-base text-ctext truncate">
              {item.title}
            </h2>
            {item.subtitle && (
              <p className="text-[10px] text-ctext-mid mt-0.5">{item.subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ctext-dim hover:text-ctext transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {item.image && (
          <img
            src={moduleImageUrl(moduleId, item.image)}
            alt=""
            loading="lazy"
            className="w-full max-h-64 object-cover border-b border-glass-border"
          />
        )}

        <div className="p-4 space-y-3">
          {item.date && (
            <p className="text-[10px] text-ctext-mid">
              {new Date(item.date).toLocaleDateString(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          )}

          {item.detail?.length > 0 && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              {item.detail.map((entry) => (
                <div key={entry.label} className="contents">
                  <dt className="text-[9px] tracking-[1.5px] uppercase text-ctext-dim self-center">
                    {entry.label}
                  </dt>
                  <dd className="text-[11px] text-ctext">{entry.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {item.href && (
            <a
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="glass-pill text-[10px] text-crystal-blue border-crystal-blue/40 hover:bg-crystal-blue/15 transition-colors inline-flex items-center gap-1.5"
            >
              <ExternalLink className="w-3 h-3" />
              Open in service
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export default DetailSheet;
