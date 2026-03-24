import { cn } from "@/lib/utils";
import logoSrc from "@/assets/syag-logo-inapp.png";

interface OSChiefLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
}

/**
 * OSChief logo — nautilus shell with circuit brain. Uses bundled asset so it loads in Electron.
 * Sizing: 24px sidebar, 20px tray menu per macOS/HIG.
 */
export function OSChiefLogo({ size = 24, className, showText = false }: OSChiefLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <img
        src={logoSrc}
        alt="OSChief"
        width={size}
        height={size}
        className="flex-shrink-0 object-contain rounded-md"
      />
      {showText && (
        <span className="font-display text-lg text-foreground tracking-tight">OSChief</span>
      )}
    </span>
  );
}
