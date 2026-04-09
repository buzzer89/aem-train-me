"use client";

import React, { useRef, useState } from "react";

interface ResizablePanelProps {
  minWidth?: number;
  maxWidth?: number;
  width: number;
  setWidth: (width: number) => void;
  children: React.ReactNode;
  className?: string;
  side: "left" | "right";
}

export default function ResizablePanel({
  minWidth = 180,
  maxWidth = 600,
  width,
  setWidth,
  children,
  className = "",
  side,
}: ResizablePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const onMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    e.preventDefault();
  };

  React.useEffect(() => {
    if (!dragging) return;
    const onMouseMove = (e: MouseEvent) => {
      if (!panelRef.current) return;
      let newWidth = width;
      if (side === "left") {
        newWidth = e.clientX - panelRef.current.getBoundingClientRect().left;
      } else {
        newWidth =
          panelRef.current.getBoundingClientRect().right - e.clientX;
      }
      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      setWidth(newWidth);
    };
    const onMouseUp = () => setDragging(false);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragging, minWidth, maxWidth, setWidth, width, side]);

  return (
    <div
      ref={panelRef}
      className={className}
      style={{ width, minWidth, maxWidth, position: "relative" }}
    >
      {children}
      <div
        className={`absolute top-0 ${
          side === "left" ? "right-0" : "left-0"
        } h-full w-2 cursor-col-resize z-20`}
        onMouseDown={onMouseDown}
        style={{
          background: dragging ? "rgba(255,255,255,0.08)" : "transparent",
          transition: "background 0.2s",
        }}
      />
    </div>
  );
}
