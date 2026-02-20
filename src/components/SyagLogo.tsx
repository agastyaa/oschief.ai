import { cn } from "@/lib/utils";

interface SyagLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
}

/**
 * Syag logo — brain-and-pen mark. Uses standard in-app asset (96px source).
 * Sizing: 24px sidebar, 20px tray menu per macOS/HIG.
 */
export function SyagLogo({ size = 24, className, showText = false }: SyagLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <img
        src="/syag-logo-inapp.png"
        alt="Syag"
        width={size}
        height={size}
        className="flex-shrink-0 object-contain"
      />
      {showText && (
        <span className="font-display text-lg text-foreground tracking-tight">syag</span>
      )}
    </span>
  );
}
