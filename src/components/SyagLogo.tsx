import { cn } from "@/lib/utils";
import logoSrc from "@/assets/syag-logo-inapp.png";

interface SyagLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
}

/**
 * Syag logo — brain-and-pen mark. Uses bundled asset so it loads in Electron.
 * Sizing: 24px sidebar, 20px tray menu per macOS/HIG.
 */
export function SyagLogo({ size = 24, className, showText = false }: SyagLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <img
        src={logoSrc}
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
