import { useState } from "react";
import { VIEW_COMPONENTS, VIEW_LABELS } from "./views";
import { useViewPreference } from "../../hooks/useViewPreference";

/**
 * One dataset, drawn in whichever view is selected.
 *
 * The switcher only offers views the shape actually supports, so it is never
 * possible to ask for a calendar of undated things.
 */
const DatasetSection = ({ moduleId, dataset, onSelectItem }) => {
  const { view, views, selectView } = useViewPreference(moduleId, dataset);
  const View = VIEW_COMPONENTS[view];

  return (
    <section className="py-2 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        {dataset.label && (
          <h3 className="text-[9px] tracking-[2px] uppercase text-ctext-dim">
            {dataset.label}
          </h3>
        )}

        {views.length > 1 && (
          <div className="flex items-center gap-0.5" role="group" aria-label="View">
            {views.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => selectView(option)}
                aria-pressed={option === view}
                className={`px-1.5 py-0.5 rounded-sm text-[9px] transition-colors ${
                  option === view
                    ? "text-crystal-blue bg-crystal-blue/10"
                    : "text-ctext-dim hover:text-ctext-mid"
                }`}
              >
                {VIEW_LABELS[option] ?? option}
              </button>
            ))}
          </div>
        )}
      </div>

      {View ? (
        <View dataset={dataset} moduleId={moduleId} onSelect={onSelectItem} />
      ) : (
        // A view this build does not have yet, e.g. calendar before phase 3.
        <p className="text-[10px] text-ctext-mid py-3">
          The {VIEW_LABELS[view] ?? view} view isn&rsquo;t available yet.
        </p>
      )}
    </section>
  );
};

export default DatasetSection;
