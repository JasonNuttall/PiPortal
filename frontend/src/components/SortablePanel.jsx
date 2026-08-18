import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useRowSpan } from "../hooks/useRowSpan";

const SortablePanel = ({ id, size = "compact", isCollapsed = false, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const { ref: contentRef, span, measured } = useRowSpan();

  const style = {
    // Translate, not Transform: dnd-kit's transform carries scaleX/scaleY so a
    // dragged item morphs into the size of whatever it is over. That was
    // invisible when every panel was the same size, but panels now differ in
    // both column span and measured height, so it stretched them grotesquely
    // mid-drag. Only the movement is wanted.
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    // How many of the grid's fine rows this panel's content actually needs.
    "--row-span": span,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      // The grid reads these to decide how many columns the panel spans.
      data-size={size}
      data-collapsed={isCollapsed ? "true" : "false"}
      data-measured={measured ? "true" : "false"}
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

      <div ref={contentRef}>{children}</div>
    </div>
  );
};

export default SortablePanel;
