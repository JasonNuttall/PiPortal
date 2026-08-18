import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

const SortablePanel = ({ id, size = "compact", isCollapsed = false, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      // The grid reads these to decide how many columns the panel spans.
      data-size={size}
      data-collapsed={isCollapsed ? "true" : "false"}
      className="relative group"
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute -left-5 top-3 p-1.5 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity z-10 hidden md:block"
        title="Drag to reorder"
      >
        <GripVertical className="w-4 h-4 text-ctext-dim hover:text-ctext-mid" />
      </div>

      <div>{children}</div>
    </div>
  );
};

export default SortablePanel;
