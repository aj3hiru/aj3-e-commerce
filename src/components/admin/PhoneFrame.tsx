import { cn } from "@/lib/utils";

/**
 * The phone mockup used by every admin preview (same look as the Push
 * Manager's lock-screen preview, without the notch). `width`/`height` are the
 * screen size; the frame adds its border around them.
 */
export function PhoneFrame({ width = 300, height = 600, fill, className, screenClassName, children }: {
  width?: number; height?: number; fill?: boolean; className?: string; screenClassName?: string; children: React.ReactNode;
}) {
  return (
    <div className={cn("relative shrink-0 overflow-hidden rounded-[40px] border-4 border-[#444] bg-[#111] shadow-[0_0_0_10px_#333,0_20px_50px_rgba(0,0,0,0.2)]", className)}
      style={fill ? { width: width + 8, height: "100%", maxHeight: height + 8 } : { width: width + 8, height: height + 8 }}>
      <div className={cn("relative h-full w-full overflow-hidden rounded-[36px] bg-white", screenClassName)}>{children}</div>
    </div>
  );
}
