"use client";

import { useMemo, useState } from "react";
import MiniMemoryGraph from "@/components/hr/mini-memory-graph";

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).map(String);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function formatUploadedAt(value) {
  if (!value) return "Unknown time";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";

  // Use a deterministic UTC string to avoid server/client locale hydration mismatches.
  return `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

export default function EvidenceInsightsGrid({ evidenceRows = [] }) {
  const [openImages, setOpenImages] = useState({});
  const [openEntities, setOpenEntities] = useState({});
  const [openActions, setOpenActions] = useState({});

  const rows = useMemo(() => {
    return (evidenceRows || []).map((item) => {
      const entities = normalizeList(item.ai_entities);
      const actions = normalizeList(item.ai_actions);
      return { ...item, entities, actions };
    });
  }, [evidenceRows]);

  const toggleImage = (evidenceId) => {
    setOpenImages((prev) => ({ ...prev, [evidenceId]: !prev[evidenceId] }));
  };

  const toggleEntities = (evidenceId) => {
    setOpenEntities((prev) => ({ ...prev, [evidenceId]: !prev[evidenceId] }));
  };

  const toggleActions = (evidenceId) => {
    setOpenActions((prev) => ({ ...prev, [evidenceId]: !prev[evidenceId] }));
  };

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No AI-analyzed evidence found.</p>;
  }

  return (
    <div className="space-y-4">
      {rows.map((item) => {
        const imageVisible = Boolean(openImages[item.id]);
        const entitiesVisible = Boolean(openEntities[item.id]);
        const actionsVisible = Boolean(openActions[item.id]);

        return (
          <div key={item.id} className="rounded-lg border bg-muted/20 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Uploaded {formatUploadedAt(item.uploaded_at)}
              </p>
              {item.storage_path && (
                <button
                  type="button"
                  onClick={() => toggleImage(item.id)}
                  className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted"
                >
                  {imageVisible ? "Hide Image" : "Show Image"}
                </button>
              )}
            </div>

            {imageVisible && item.storage_path && (
              <img
                src={item.storage_path}
                alt="Evidence"
                className="mb-3 max-h-64 w-full rounded-md border object-contain"
              />
            )}

            <MiniMemoryGraph entities={item.entities} actions={item.actions} />

            {item.ai_description && (
              <div className="mt-3 rounded-md bg-background p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  AI Description
                </p>
                <p className="mt-1 text-sm leading-relaxed">{item.ai_description}</p>
              </div>
            )}

            {item.ai_ocr_text && (
              <div className="mt-3 rounded-md border border-dashed bg-background p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  OCR Extracted Text
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  {item.ai_ocr_text}
                </p>
              </div>
            )}

            {item.entities.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Entities
                  </p>
                  <button
                    type="button"
                    onClick={() => toggleEntities(item.id)}
                    className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted"
                  >
                    {entitiesVisible ? "Hide" : `Show (${item.entities.length})`}
                  </button>
                </div>
                {entitiesVisible ? <p className="mt-1 text-sm">{item.entities.join(", ")}</p> : null}
              </div>
            )}

            {item.actions.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Actions
                  </p>
                  <button
                    type="button"
                    onClick={() => toggleActions(item.id)}
                    className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted"
                  >
                    {actionsVisible ? "Hide" : `Show (${item.actions.length})`}
                  </button>
                </div>
                {actionsVisible ? <p className="mt-1 text-sm">{item.actions.join(", ")}</p> : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
