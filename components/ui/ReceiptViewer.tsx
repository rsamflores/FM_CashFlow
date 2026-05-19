"use client";

import { useState } from "react";

type Props = {
  url: string;
  compact?: boolean;
};

export function ReceiptViewer({ url, compact = false }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-xs rounded-full font-bold transition-opacity hover:opacity-80 shrink-0"
        style={{
          height: compact ? 28 : 32,
          paddingLeft: compact ? "8px" : "12px",
          paddingRight: compact ? "8px" : "12px",
          fontSize: compact ? 12 : 13,
          background: "var(--color-tertiary)15",
          color: "var(--color-tertiary)",
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: compact ? 14 : 16 }}>
          receipt_long
        </span>
        Ver comprobante
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-md"
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          <div
            className="relative z-10 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            style={{ maxWidth: 600, maxHeight: "90dvh", width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-lg py-md shrink-0"
              style={{ background: "var(--color-surface-container)" }}
            >
              <div className="flex items-center gap-sm">
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--color-tertiary)" }}>
                  receipt_long
                </span>
                <p className="text-body-sm font-bold text-on-surface">Comprobante de gasto</p>
              </div>
              <div className="flex items-center gap-sm">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-xs h-8 px-md rounded-full text-label-md font-bold transition-opacity hover:opacity-80"
                  style={{ background: "var(--color-primary)20", color: "var(--color-primary)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>open_in_new</span>
                  Abrir
                </a>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                </button>
              </div>
            </div>
            <div
              className="overflow-auto flex items-center justify-center"
              style={{ background: "var(--color-surface-container-lowest)", minHeight: 200 }}
            >
              <img
                src={url}
                alt="Comprobante"
                className="max-w-full object-contain"
                style={{ maxHeight: "75dvh" }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
