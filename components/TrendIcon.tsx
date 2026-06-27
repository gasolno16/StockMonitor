import type { CSSProperties } from "react";

type TrendIconProps = {
  direction: "up" | "down" | "flat";
  className?: string;
};

export default function TrendIcon({ direction, className = "" }: TrendIconProps) {
  const iconUrl = `/icons/trend-${direction}.svg`;
  const style: CSSProperties = {
    WebkitMaskImage: `url("${iconUrl}")`,
    maskImage: `url("${iconUrl}")`,
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
    WebkitMaskSize: "contain",
    maskSize: "contain",
  };

  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 bg-current align-[-0.08em] ${className}`}
      style={style}
    />
  );
}
