"use client";

import { useState } from "react";
import type { WorkspaceSlotResponse } from "@/contracts/workspace";

interface WorkspaceRingProps {
  slots: WorkspaceSlotResponse[];
  capacity: { used: number; total: number };
  onSlotClick?: (slot: WorkspaceSlotResponse) => void;
}

const RING_RADIUS = 140;
const CENTER = 180;
const VIEW_SIZE = 360;

export function WorkspaceRing({ slots, capacity, onSlotClick }: WorkspaceRingProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const total = capacity.total;

  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-6">
      <p className="text-[11px] font-medium text-stone-500 uppercase tracking-wider mb-4">
        Workspace Ring
      </p>

      <svg
        viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
        className="w-full max-w-[280px] mx-auto"
      >
        {/* Ring track */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RING_RADIUS}
          fill="none"
          stroke="rgba(214, 211, 209, 0.3)"
          strokeWidth="1.5"
        />

        {/* Slot circles */}
        {slots.map((slot, i) => {
          const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
          const x = CENTER + RING_RADIUS * Math.cos(angle);
          const y = CENTER + RING_RADIUS * Math.sin(angle);
          const isOccupied = slot.memoryId !== null;
          const isHovered = hoveredIndex === i;

          if (isOccupied) {
            const radius = 8 + slot.loading * 12;
            const fill = slot.pinned ? "#f59e0b" : "#84cc16";
            const hoverRadius = isHovered ? radius + 3 : radius;

            return (
              <g key={i}>
                {/* Hover glow */}
                {isHovered && (
                  <circle
                    cx={x}
                    cy={y}
                    r={hoverRadius + 4}
                    fill="none"
                    stroke={fill}
                    strokeWidth="1"
                    opacity="0.3"
                  />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={hoverRadius}
                  fill={fill}
                  opacity={0.5 + slot.loading * 0.5}
                  className="cursor-pointer transition-all duration-150"
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onClick={() => onSlotClick?.(slot)}
                />
              </g>
            );
          }

          // Empty slot
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={6}
              fill="none"
              stroke="rgba(214, 211, 209, 0.4)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          );
        })}

        {/* Center text */}
        <text
          x={CENTER}
          y={CENTER - 6}
          textAnchor="middle"
          dominantBaseline="middle"
          className="text-3xl font-light"
          fill="#44403c"
        >
          {capacity.used}
        </text>
        <text
          x={CENTER}
          y={CENTER + 16}
          textAnchor="middle"
          dominantBaseline="middle"
          className="text-[11px] font-medium"
          fill="#a8a29e"
        >
          of {capacity.total} slots
        </text>
      </svg>

      {/* Hovered slot tooltip */}
      {hoveredIndex !== null && slots[hoveredIndex]?.conceptLabel && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-stone-50 border border-stone-200">
          <div className="flex items-center gap-2 mb-0.5">
            {slots[hoveredIndex].pinned && (
              <span className="text-[9px] font-semibold text-amber-600 uppercase tracking-wider">
                Pinned
              </span>
            )}
            <span className="text-[9px] text-stone-400 uppercase tracking-wider">
              Slot {hoveredIndex + 1}
            </span>
          </div>
          <p className="text-[12px] text-stone-700 leading-relaxed line-clamp-2">
            {slots[hoveredIndex].conceptLabel}
          </p>
          <p className="text-[10px] text-stone-400 mt-0.5">
            Loading: {Math.round(slots[hoveredIndex].loading * 100)}%
          </p>
        </div>
      )}
    </div>
  );
}
