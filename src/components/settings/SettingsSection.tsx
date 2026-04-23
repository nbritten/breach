import type { ReactNode } from "react";

interface Props {
  label: string;
  description?: ReactNode;
  onAdd?: () => void;
  addLabel?: string;
  emptyLabel?: ReactNode;
  itemCount: number;
  children?: ReactNode;
}

export function SettingsSection({
  label,
  description,
  onAdd,
  addLabel = "+ Add",
  emptyLabel,
  itemCount,
  children,
}: Props) {
  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between mb-1">
        <label className="block text-sm font-medium">{label}</label>
        {onAdd && (
          <button
            onClick={onAdd}
            className="text-xs px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700"
          >
            {addLabel}
          </button>
        )}
      </div>
      {description && (
        <p className="text-xs text-neutral-500 mb-3">{description}</p>
      )}
      {itemCount === 0 && emptyLabel ? (
        <div className="text-sm text-neutral-500 italic py-3 border border-dashed border-neutral-800 rounded text-center">
          {emptyLabel}
        </div>
      ) : (
        <div className="flex flex-col gap-2">{children}</div>
      )}
    </section>
  );
}
