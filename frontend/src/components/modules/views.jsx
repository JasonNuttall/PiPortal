import { memo } from "react";
import { moduleImageUrl } from "../../api/api";

/**
 * The portal's own presentation of module data.
 *
 * Modules never choose these — they say what their data means and these decide
 * how it looks, which is what lets one payload be a list, a grid or a calendar
 * without the service knowing.
 */

const TONE_TEXT = {
  ok: "text-crystal-blue",
  warn: "text-yellow-400",
  error: "text-red-400",
};

const barClass = (percent) => {
  if (percent == null) return "crystal-bar-blue";
  if (percent < 50) return "crystal-bar-teal";
  if (percent < 75) return "crystal-bar-seafoam";
  if (percent < 90) return "crystal-bar-blue";
  return "crystal-bar-warn";
};

const formatDay = (date) =>
  new Date(date).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

/** A single number. */
export const StatView = memo(function StatView({ dataset }) {
  const percent =
    dataset.max > 0 ? (dataset.value / dataset.max) * 100 : null;

  return (
    <div className="py-2">
      <div className="flex items-baseline gap-1.5">
        <span
          className={`font-spectral text-4xl leading-none ${
            TONE_TEXT[dataset.tone] ?? "text-crystal-blue"
          }`}
          style={{ textShadow: "0 0 18px rgba(56, 189, 248, 0.4)" }}
        >
          {dataset.value}
        </span>
        {dataset.unit && (
          <span className="text-ctext-mid text-xs">{dataset.unit}</span>
        )}
        {dataset.max != null && (
          <span className="text-ctext-dim text-[10px]">/ {dataset.max}</span>
        )}
      </div>
      {percent != null && (
        <div className="crystal-bar-track mt-2 h-1">
          <div
            className={`crystal-bar-fill ${barClass(percent)}`}
            style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }}
          />
        </div>
      )}
    </div>
  );
});

/** Same as a stat, drawn against its maximum. */
export const GaugeView = StatView;

/** Dense rows — the safe default for anything with items. */
export const ListView = memo(function ListView({ dataset, onSelect }) {
  if (dataset.items.length === 0) return <EmptyDataset />;

  return (
    <ul className="divide-y divide-glass-border -my-1">
      {dataset.items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onSelect(item)}
            className="w-full text-left py-2 px-1 flex items-baseline gap-2 hover:bg-glass-hover transition-colors rounded-sm"
          >
            <span className="text-[11px] text-ctext truncate flex-1">
              {item.title}
            </span>
            {item.subtitle && (
              <span className="text-[9px] text-ctext-mid shrink-0">
                {item.subtitle}
              </span>
            )}
            <span
              className={`text-[9px] shrink-0 ${
                TONE_TEXT[item.tone] ?? "text-ctext-dim"
              }`}
            >
              {item.meta ?? (item.date ? formatDay(item.date) : "")}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
});

/** Cards, which is where artwork earns its place. */
export const GridView = memo(function GridView({ dataset, moduleId, onSelect }) {
  if (dataset.items.length === 0) return <EmptyDataset />;

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-3">
      {dataset.items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item)}
          className="text-left group/card"
        >
          <div className="aspect-[2/3] bg-glass border border-glass-border rounded-sm overflow-hidden flex items-center justify-center">
            {item.image ? (
              <img
                src={moduleImageUrl(moduleId, item.image)}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover group-hover/card:scale-105 transition-transform"
              />
            ) : (
              // No artwork is normal, not an error; the card still works.
              <span className="text-[9px] text-ctext-dim px-2 text-center">
                {item.title}
              </span>
            )}
          </div>
          <p className="text-[10px] text-ctext truncate mt-1.5">{item.title}</p>
          {item.subtitle && (
            <p className="text-[9px] text-ctext-dim truncate">{item.subtitle}</p>
          )}
        </button>
      ))}
    </div>
  );
});

/** Columns built from the detail pairs items already carry. */
export const TableView = memo(function TableView({ dataset, onSelect }) {
  if (dataset.items.length === 0) return <EmptyDataset />;

  const columns = [
    ...new Set(dataset.items.flatMap((item) => item.detail.map((d) => d.label))),
  ].slice(0, 4);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="text-ctext-dim">
            <th className="text-left font-normal pb-1.5 pr-3">Name</th>
            {columns.map((column) => (
              <th key={column} className="text-left font-normal pb-1.5 pr-3">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataset.items.map((item) => (
            <tr
              key={item.id}
              onClick={() => onSelect(item)}
              className="border-t border-glass-border hover:bg-glass-hover cursor-pointer"
            >
              <td className="py-1.5 pr-3 text-ctext">{item.title}</td>
              {columns.map((column) => (
                <td key={column} className="py-1.5 pr-3 text-ctext-mid">
                  {item.detail.find((d) => d.label === column)?.value ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

/** Chronological, grouped by day. */
export const AgendaView = memo(function AgendaView({ dataset, onSelect }) {
  if (dataset.items.length === 0) return <EmptyDataset />;

  const byDay = new Map();
  for (const item of [...dataset.items].sort((a, b) => a.date.localeCompare(b.date))) {
    const day = item.date.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(item);
  }

  return (
    <div className="space-y-3">
      {[...byDay.entries()].map(([day, items]) => (
        <div key={day}>
          <p className="text-[9px] tracking-[2px] uppercase text-ctext-dim mb-1">
            {formatDay(day)}
          </p>
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  className="w-full text-left flex items-baseline gap-2 py-1 px-1 hover:bg-glass-hover rounded-sm transition-colors"
                >
                  <span className="text-[11px] text-ctext truncate flex-1">
                    {item.title}
                  </span>
                  {item.subtitle && (
                    <span className="text-[9px] text-ctext-mid">{item.subtitle}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
});

const EmptyDataset = () => (
  <p className="text-[10px] text-ctext-mid text-center py-4">Nothing to show</p>
);

export const VIEW_COMPONENTS = {
  stat: StatView,
  gauge: GaugeView,
  list: ListView,
  grid: GridView,
  table: TableView,
  agenda: AgendaView,
};

export const VIEW_LABELS = {
  stat: "Stat",
  gauge: "Gauge",
  list: "List",
  grid: "Grid",
  table: "Table",
  agenda: "Agenda",
  calendar: "Calendar",
};
