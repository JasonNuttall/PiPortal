import { memo } from "react";
import { Link as LinkIcon, ExternalLink } from "lucide-react";
import BasePanel from "./BasePanel";
import ErrorBoundary from "./ErrorBoundary";

/**
 * Quick links, which are now link modules.
 *
 * A link is a module that reports nothing, so these come from the same
 * registry as everything else. Editing happens there rather than inline here,
 * which is what collapses the old two-registry arrangement into one.
 */
const LinksPanel = memo(function LinksPanel({
  links,
  loaded,
  isCollapsed,
  onCollapseChange,
  onManage,
  size,
  onCycleSize,
}) {
  const grouped = links.reduce((acc, link) => {
    const category = link.category || "Other";
    (acc[category] ??= []).push(link);
    return acc;
  }, {});

  const manageButton = (
    <button
      type="button"
      onClick={onManage}
      className="glass-pill text-[9px] text-ctext-mid hover:text-ctext transition-colors"
    >
      Manage
    </button>
  );

  return (
    <ErrorBoundary panelName="Quick Links">
      <BasePanel
        title="Quick Links"
        icon={LinkIcon}
        iconColor="text-crystal-blue"
        data={loaded ? links : null}
        subtitle={`(${links.length})`}
        isCollapsed={isCollapsed}
        onCollapseChange={onCollapseChange}
        headerActions={manageButton}
        panelId="services"
        size={size}
        onCycleSize={onCycleSize}
      >
        {(data) =>
          data.length === 0 ? (
            <p className="text-[10px] text-ctext-mid text-center py-4">
              No links yet. Add one under Manage.
            </p>
          ) : (
            <div className="space-y-3">
              {Object.entries(grouped).map(([category, entries]) => (
                <div key={category}>
                  <p className="text-[9px] tracking-[2px] uppercase text-ctext-dim mb-1">
                    {category}
                  </p>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-1.5">
                    {entries.map((link) => (
                      <a
                        key={link.id}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-2 py-1.5 bg-glass border border-glass-border rounded-sm hover:bg-glass-hover hover:border-glass-border-hover transition-colors group/link"
                      >
                        <span className="text-sm shrink-0">{link.icon || "•"}</span>
                        <span className="text-[10px] text-ctext truncate flex-1">
                          {link.name}
                        </span>
                        <ExternalLink className="w-3 h-3 text-ctext-dim opacity-0 group-hover/link:opacity-100 transition-opacity shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </BasePanel>
    </ErrorBoundary>
  );
});

export default LinksPanel;
