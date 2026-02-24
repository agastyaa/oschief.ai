import { cn } from "@/lib/utils";
import logoSrc from "@/assets/syag-logo-inapp.png";

interface SyagLogoProps {
  /** Width in pixels; height is auto to preserve aspect ratio. Use larger value (e.g. 140) for sidebar. */
  size?: number;
  className?: string;
  /** No longer used — logo image includes SYAG AI text. Kept for API compatibility. */
  showText?: boolean;
}

/**
 * Syag logo — single in-app image (graphic + SYAG AI text). No separate text label.
 */
export function SyagLogo({ size = 24, className, showText: _showText }: SyagLogoProps) {
  return (
    <span className={cn("inline-flex items-center bg-transparent", className)}>
      <img
        src={logoSrc}
        alt="SYAG AI"
        width={size}
        className="flex-shrink-0 object-contain object-left"
        style={{ width: size, height: "auto" }}
      />
    </span>
  );
}
