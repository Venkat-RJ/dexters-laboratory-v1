import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import laboratoryIcon from "../../../src-tauri/icons/app-icon.svg";

export type LatticeMarkProps = {
  size?: number;
  motion?: "none" | "weave";
  className?: string;
};

/** Reuse the established mark component at existing welcome-screen call sites. */
export function LatticeMark({ size = 24, className }: LatticeMarkProps) {
  const style: CSSProperties = { width: size, height: size };
  return <img src={laboratoryIcon} className={cn(className)} style={style} alt="" aria-hidden="true" />;
}
