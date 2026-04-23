interface Props {
  onClick: () => void;
  label: string;
}

export function RemoveButton({ onClick, label }: Props) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title="Remove"
      className="p-1.5 rounded text-neutral-500 hover:text-rose-300 hover:bg-neutral-800"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 6h18" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      </svg>
    </button>
  );
}
