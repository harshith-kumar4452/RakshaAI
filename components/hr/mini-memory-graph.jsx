"use client";

function polarToCartesian(cx, cy, radius, angleRad) {
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  };
}

function buildNodes(entities, actions) {
  const center = { id: "core", label: "Evidence", type: "core", x: 50, y: 50 };

  const entityNodes = entities.slice(0, 6).map((label, index, arr) => {
    const angle = (-Math.PI * 0.9) + (index * (Math.PI * 0.8)) / Math.max(arr.length - 1, 1);
    const pos = polarToCartesian(50, 45, 34, angle);
    return { id: `e-${index}`, label, type: "entity", x: pos.x, y: pos.y };
  });

  const actionNodes = actions.slice(0, 4).map((label, index, arr) => {
    const angle = (Math.PI * 0.2) + (index * (Math.PI * 0.6)) / Math.max(arr.length - 1, 1);
    const pos = polarToCartesian(50, 58, 28, angle);
    return { id: `a-${index}`, label, type: "action", x: pos.x, y: pos.y };
  });

  const allNodes = [center, ...entityNodes, ...actionNodes];
  const edges = [];

  entityNodes.forEach((node) => {
    edges.push({ from: center.id, to: node.id });
  });

  actionNodes.forEach((actionNode) => {
    const target = entityNodes.find((entityNode) => {
      const a = actionNode.label.toLowerCase();
      const b = entityNode.label.toLowerCase();
      return a.includes(b) || b.includes(a);
    });

    edges.push({ from: actionNode.id, to: target ? target.id : center.id });
  });

  return { nodes: allNodes, edges };
}

export default function MiniMemoryGraph({ entities = [], actions = [] }) {
  const safeEntities = Array.isArray(entities) ? entities.filter(Boolean).map(String) : [];
  const safeActions = Array.isArray(actions) ? actions.filter(Boolean).map(String) : [];

  if (safeEntities.length === 0 && safeActions.length === 0) {
    return (
      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        Memory graph unavailable (no entities/actions extracted).
      </div>
    );
  }

  const { nodes, edges } = buildNodes(safeEntities, safeActions);

  return (
    <div className="rounded-md border bg-gradient-to-br from-slate-50 to-blue-50 p-2">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">3D Memory Graph</p>
      <div className="relative h-40 overflow-hidden rounded-md border bg-white [transform:perspective(900px)_rotateX(12deg)]">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {edges.map((edge, index) => {
            const from = nodes.find((n) => n.id === edge.from);
            const to = nodes.find((n) => n.id === edge.to);
            if (!from || !to) return null;

            return (
              <line
                key={`${edge.from}-${edge.to}-${index}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="#94a3b8"
                strokeWidth="0.8"
                opacity="0.9"
              />
            );
          })}
        </svg>

        {nodes.map((node) => {
          const styles =
            node.type === "core"
              ? "bg-blue-600 text-white border-blue-700"
              : node.type === "entity"
                ? "bg-cyan-100 text-cyan-800 border-cyan-300"
                : "bg-amber-100 text-amber-800 border-amber-300";

          return (
            <div
              key={node.id}
              className={[
                "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-2 py-0.5 text-[10px] font-medium shadow-sm",
                styles,
              ].join(" ")}
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
              title={node.label}
            >
              {node.label.length > 14 ? `${node.label.slice(0, 14)}...` : node.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
