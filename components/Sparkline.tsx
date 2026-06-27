"use client";

import { useId } from "react";

interface Props {
  data: number[];
  width?: number;
  height?: number;
  positive?: boolean;
}

export default function Sparkline({ data, width = 80, height = 28, positive }: Props) {
  const gradientId = useId().replace(/:/g, "");

  if (data.length < 2) return <div style={{ width, height }} />;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = height * 0.12;

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return { x, y };
  });

  const color = positive ? "#ef4444" : "#3b82f6";

  const linePath = pts.reduce((path, point, i) => {
    if (i === 0) return `M${point.x},${point.y}`;

    const prev = pts[i - 1];
    const controlX = (prev.x + point.x) / 2;
    return `${path} C${controlX},${prev.y} ${controlX},${point.y} ${point.x},${point.y}`;
  }, "");
  const fillPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${gradientId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
