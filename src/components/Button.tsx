import { forwardRef, type ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  iconOnly?: boolean;
};

/** Shared control sizing, focus, and interaction states for app actions. */
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "secondary", iconOnly = false, className = "", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`button button-${variant} ${iconOnly ? "button-icon" : ""} ${className}`}
      {...props}
    />
  );
});
