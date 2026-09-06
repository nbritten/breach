import type { SVGProps } from "react";

export type IconName = "refresh" | "check" | "close" | "terminal" | "external" | "pin" | "plus" | "download" | "info" | "filter" | "chevron";

const paths: Record<IconName, string> = {
  refresh: "M20 7v5h-5M4 17v-5h5M6.1 6.1A8 8 0 0 1 19.5 10M4.5 14a8 8 0 0 0 13.4 3.9",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12M18 6 6 18",
  terminal: "M4 4h16v16H4zM7 8l3 3-3 3M13 15h4",
  external: "M14 4h6v6M20 4l-9 9M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5",
  pin: "m16 3 5 5-5 2-3 5-1 1-4-4 1-1 5-3 2-5ZM8 16l-5 5",
  plus: "M12 5v14M5 12h14",
  download: "M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4",
  info: "M12 11v6M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  filter: "M4 6h16M7 12h10M10 18h4",
  chevron: "m8 5 7 7-7 7",
};

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d={paths[name]} />
    </svg>
  );
}
