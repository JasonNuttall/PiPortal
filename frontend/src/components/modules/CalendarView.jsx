import { memo, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * A month of dated items.
 *
 * The view a schedule exists for. Entries are placed by their local date, and
 * a day with more entries than fit shows a count that opens that day rather
 * than overflowing its cell — which keeps a busy month readable and the cell
 * height predictable.
 */
const MAX_PER_DAY = 3;

const TONE_DOT = {
  ok: "bg-crystal-blue",
  warn: "bg-yellow-400",
  error: "bg-red-400",
};

/** Local Y-M-D, so an item never lands on the wrong day via UTC. */
export const localDayKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
};

/**
 * The 6x7 grid a month is drawn on, starting on Monday.
 * Always six weeks so the panel does not change height month to month.
 */
export const buildMonthGrid = (year, month) => {
  const first = new Date(year, month, 1);
  // getDay() is Sunday-based; shift so Monday is 0.
  const leading = (first.getDay() + 6) % 7;

  const start = new Date(year, month, 1 - leading);
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return {
      key: localDayKey(date),
      day: date.getDate(),
      inMonth: date.getMonth() === month,
    };
  });
};

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const CalendarView = memo(function CalendarView({
  dataset,
  cursor,
  onCursorChange,
  onSelect,
}) {
  const { year, month } = cursor;

  const byDay = useMemo(() => {
    const map = new Map();
    for (const item of dataset.items) {
      const key = localDayKey(item.date);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return map;
  }, [dataset.items]);

  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const todayKey = localDayKey(new Date());

  const label = new Date(year, month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const step = (delta) => {
    const next = new Date(year, month + delta, 1);
    onCursorChange({ year: next.getFullYear(), month: next.getMonth() });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Previous month"
          disabled={!dataset.window}
          className="p-1 rounded-sm text-ctext-dim hover:text-ctext hover:bg-glass-hover disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          title={
            dataset.window
              ? "Previous month"
              : "This module only reports the range it sent"
          }
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <span className="text-[11px] text-ctext">{label}</span>

        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Next month"
          disabled={!dataset.window}
          className="p-1 rounded-sm text-ctext-dim hover:text-ctext hover:bg-glass-hover disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          title={
            dataset.window
              ? "Next month"
              : "This module only reports the range it sent"
          }
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px mb-1">
        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            className="text-[8px] tracking-[1px] uppercase text-ctext-dim text-center py-0.5"
          >
            {weekday}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-glass-border">
        {cells.map((cell) => {
          const entries = byDay.get(cell.key) ?? [];
          const shown = entries.slice(0, MAX_PER_DAY);
          const hidden = entries.length - shown.length;

          return (
            <div
              key={cell.key}
              className={`min-h-[3.6rem] p-1 bg-crystal-void ${
                cell.inMonth ? "" : "opacity-35"
              }`}
            >
              <div
                className={`text-[9px] mb-0.5 ${
                  cell.key === todayKey
                    ? "text-crystal-blue font-medium"
                    : "text-ctext-dim"
                }`}
              >
                {cell.day}
              </div>

              {shown.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item)}
                  title={`${item.title}${item.subtitle ? ` — ${item.subtitle}` : ""}`}
                  className="w-full flex items-center gap-1 text-left mb-0.5 hover:bg-glass-hover rounded-sm px-0.5 transition-colors"
                >
                  <span
                    className={`w-1 h-1 rounded-full shrink-0 ${
                      TONE_DOT[item.tone] ?? "bg-crystal-teal"
                    }`}
                  />
                  <span className="text-[9px] text-ctext truncate">
                    {item.title}
                  </span>
                </button>
              ))}

              {hidden > 0 && (
                <button
                  type="button"
                  onClick={() => onSelect(entries[shown.length])}
                  className="text-[9px] text-ctext-dim hover:text-ctext px-0.5 transition-colors"
                >
                  +{hidden} more
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default CalendarView;
