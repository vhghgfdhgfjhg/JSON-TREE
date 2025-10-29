import React, { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";


function parseJsonPath(input) {
  if (!input) return [];
  let s = input.trim();
  if (s.startsWith("$")) s = s.slice(1); 
  if (s.startsWith(".")) s = s.slice(1); 

  const tokens = [];
  let buf = "";
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === ".") {
      if (buf) tokens.push(buf), (buf = "");
      i++;
      continue;
    }
    if (ch === "[") {
      if (buf) tokens.push(buf), (buf = "");
      let j = i + 1;
      let acc = "";
      while (j < s.length && s[j] !== "]") {
        acc += s[j];
        j++;
      }
      if (j >= s.length) {
        return null;
      }
      const idx = acc.trim();
      if (!/^\d+$/.test(idx)) return null; 
      tokens.push(`[${idx}]`);
      i = j + 1;
      if (s[i] === ".") i++; // eat trailing dot if any
      continue;
    }
    buf += ch;
    i++;
  }
  if (buf) tokens.push(buf);
  return tokens.filter(Boolean);
}


function makeChildPath(parentPath, key) {
  if (key.startsWith("[")) {
    // array index
    return parentPath ? `${parentPath}${key}` : `${key}`;
  }
  // object key
  return parentPath ? `${parentPath}.${key}` : key;
}


const COLORS = {
  object: {
    bg: "#e0e7ff",
    border: "#6366f1", 
  },
  array: {
    bg: "#dcfce7", 
    border: "#22c55e",
  },
  primitive: {
    bg: "#ffedd5",
    border: "#f97316", 
  },
  highlight: {
    border: "#f59e0b", 
    shadow: "0 0 0 3px rgba(245, 158, 11, 0.35)",
  },
};

function buildFlowFromJSON(json) {
  const nodes = [];
  const edges = [];

  let leafOrderAtDepth = {};

  const X_STEP = 260; // horizontal spacing
  const Y_STEP = 110; // vertical spacing

  function nodeTypeOf(value) {
    if (Array.isArray(value)) return "array";
    if (value !== null && typeof value === "object") return "object";
    return "primitive";
  }

  function addNode(id, label, type, depth, tooltip) {
    const order = leafOrderAtDepth[depth] ?? 0;
    const x = order * X_STEP;
    const y = depth * Y_STEP;

    leafOrderAtDepth[depth] = order + 1;

    const style = {
      background: COLORS[type].bg,
      border: `2px solid ${COLORS[type].border}`,
      borderRadius: 12,
      padding: 10,
      fontSize: 12,
      width: 220,
    };

    nodes.push({ id, position: { x, y }, data: { label, tooltip, type }, style });
  }

  function traverse(value, path = "", depth = 0, parentId = null, keyLabel = "root") {
    const type = nodeTypeOf(value);
    let nodeLabel = "";
    if (type === "object") nodeLabel = `${keyLabel} { }`;
    else if (type === "array") nodeLabel = `${keyLabel} [ ]`;
    else nodeLabel = `${keyLabel}: ${JSON.stringify(value)}`;

    const tooltip = `${path || keyLabel}\n${type.toUpperCase()}`;

    addNode(path || keyLabel, nodeLabel, type, depth, tooltip);

    if (parentId) {
      edges.push({ id: `${parentId}->${path || keyLabel}`, source: parentId, target: path || keyLabel });
    }

    if (type === "object") {
      Object.keys(value).forEach((k) => {
        const childPath = makeChildPath(path, k);
        traverse(value[k], childPath, depth + 1, path || keyLabel, k);
      });
    } else if (type === "array") {
      value.forEach((item, idx) => {
        const k = `[${idx}]`;
        const childPath = makeChildPath(path, k);
        traverse(item, childPath, depth + 1, path || keyLabel, k);
      });
    }
  }

  traverse(json, "root", 0, null, "root");

  
  const depthCounts = Object.keys(leafOrderAtDepth).map((d) => [Number(d), leafOrderAtDepth[d]]);
  const maxCols = depthCounts.length ? Math.max(...depthCounts.map(([, c]) => c)) : 1;
  const centerX = ((maxCols - 1) * X_STEP) / 2;
  nodes.forEach((n) => {
    n.position.x -= centerX;
  });

  return { nodes, edges };
}

const Chip = ({ children }) => (
  <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium opacity-80">
    {children}
  </span>
);

function Toast({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-xl bg-black/80 px-4 py-2 text-white shadow-lg">
      <span className="text-sm">{message}</span>
      <button className="ml-3 text-xs underline" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

const SAMPLE_JSON = {
  user: {
    id: 101,
    name: "Akash",
    address: { city: "Bengaluru", zip: "560001" },
    roles: ["frontend", "ui"],
    active: true,
  },
  items: [
    { id: 1, name: "Notebook", price: 99.5 },
    { id: 2, name: "Pencil", price: 9.9 },
  ],
  meta: null,
};

export default function App() {
  const [dark, setDark] = useState(true);
  const [raw, setRaw] = useState(JSON.stringify(SAMPLE_JSON, null, 2));
  const [error, setError] = useState("");
  const [json, setJson] = useState(SAMPLE_JSON);

  const { nodes: builtNodes, edges: builtEdges } = useMemo(() => buildFlowFromJSON(json), [json]);
  const [nodes, setNodes, onNodesChange] = useNodesState(builtNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(builtEdges);

  const [query, setQuery] = useState("");
  const [matchMsg, setMatchMsg] = useState("");
  const [highlightId, setHighlightId] = useState("");
  const [toast, setToast] = useState("");

  const rf = useReactFlow(); 
  useEffect(() => {
    setNodes(builtNodes);
    setEdges(builtEdges);
    setHighlightId("");
    setMatchMsg("");
  }, [builtNodes, builtEdges, setNodes, setEdges]);

  const onConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  const visualize = useCallback(() => {
    setError("");
    try {
      const parsed = JSON.parse(raw);
      setJson(parsed);
    } catch (e) {
      setError("Invalid JSON. Please fix the syntax and try again.",e);
    }
  }, [raw]);

  const clearAll = useCallback(() => {
    
    setRaw("{}");
    setJson({});
    setQuery("");
    setHighlightId("");
    setMatchMsg("");
    setToast("");
  }, []);

  const fillSample = useCallback(() => {
    const s = JSON.stringify(SAMPLE_JSON, null, 2);
    setRaw(s);
    setJson(SAMPLE_JSON);
    setHighlightId("");
    setMatchMsg("");
  }, []);

  const findNodeByPath = useCallback(
    (pathStr) => {
      const tokens = parseJsonPath(pathStr);
      if (!tokens) return null; 
      let path = "root";
      for (const t of tokens) {
        path = makeChildPath(path, t);
      }
      const found = nodes.find((n) => n.id === path);
      return found || null;
    },
    [nodes]
  );

  const doSearch = useCallback(() => {
    setMatchMsg("");
    const q = query.trim();
    if (!q) return;
    const normalized = q.startsWith("$") || q.startsWith("root") || q.includes("[") || q.includes(".") ? q : `$.${q}`;
    const node = findNodeByPath(normalized);
    if (!node) {
      setHighlightId("");
      setMatchMsg("No match found");
      return;
    }
    setHighlightId(node.id);
    setMatchMsg("Match found");
    
    try {
      if (rf && typeof rf.fitView === "function") {
        rf.fitView({ nodes: [node], padding: 0.4, duration: 600 });
      }
    } catch (err) {
      
      console.log(err)
    }
  }, [query, findNodeByPath, rf]);

  const onNodeClick = useCallback((_, node) => {
    try {
      const text = node.id.replace(/^root\.?/, "");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
        setToast("JSON path copied to clipboard");
        setTimeout(() => setToast(""), 1500);
      } else {
       
        setToast("Copying not supported in this browser");
        setTimeout(() => setToast(""), 1500);
      }
    } catch (e) {
      // ignore
      console.log(e)
    }
  }, []);

  const decoratedNodes = useMemo(() => {
    return nodes.map((n) => {
      if (n.id === highlightId) {
        return {
          ...n,
          style: {
            ...n.style,
            boxShadow: COLORS.highlight.shadow,
            border: `3px solid ${COLORS.highlight.border}`,
          },
        };
      }
      return n;
    });
  }, [nodes, highlightId]);

  return (
    <div className={"min-h-screen " + (dark ? "bg-zinc-950 text-zinc-100" : "bg-zinc-50 text-zinc-900")}>
      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">JSON Tree Visualizer</h1>
            <p className="text-sm opacity-70">Paste JSON, generate a tree, and search by JSON path.</p>
          </div>
          <div className="flex items-center gap-2">
            <Chip>React Flow</Chip>
            <Chip>Search + Highlight</Chip>
            <button
              onClick={() => setDark((d) => !d)}
              className="rounded-2xl border px-3 py-1 text-sm hover:opacity-90"
              title="Toggle theme"
            >
              {dark ? "Light" : "Dark"} Mode
            </button>
          </div>
        </div>

        {/* Top controls */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">JSON Input</label>
            <textarea
              className="h-64 w-full resize-none rounded-xl border p-3 font-mono text-sm outline-none focus:ring-2"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              spellCheck={false}
              placeholder="Paste your JSON here"
            />
            {error && <div className="text-sm text-red-500">{error}</div>}
            <div className="flex gap-2">
              <button onClick={visualize} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
                Visualize
              </button>
              <button onClick={fillSample} className="rounded-xl border px-4 py-2 text-sm hover:bg-white/5">
                Load Sample
              </button>
              <button onClick={clearAll} className="rounded-xl border px-4 py-2 text-sm hover:bg-white/5">
                Clear
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Search by JSON Path</label>
            <input
              className="rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. $.user.address.city or items[0].name"
              onKeyDown={(e) => {
                if (e.key === "Enter") doSearch();
              }}
            />
            <div className="flex items-center gap-2">
              <button onClick={doSearch} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
                Search
              </button>
              <span className={`text-sm ${matchMsg === "No match found" ? "text-red-500" : "text-amber-500"}`}>
                {matchMsg}
              </span>
            </div>
            <p className="text-xs opacity-70">
              Tip: click a node to copy its JSON path. Hover a node to see its path & type.
            </p>
          </div>
        </div>

        {/* Canvas */}
        <div className="mt-4 h-[560px] rounded-xl border">
          <ReactFlow
            nodes={decoratedNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            fitView
            proOptions={{ hideAttribution: true }}
            nodeOrigin={[0.5, 0]}
          >
            <Background />
            <MiniMap pannable zoomable />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        <div className="mt-4 text-xs opacity-70">
          <p>
            Legend:{" "}
            <span
              className="ml-1 inline-block h-3 w-3 rounded-sm align-middle"
              style={{ background: COLORS.object.bg, border: `2px solid ${COLORS.object.border}` }}
            />
            {" "}Object &nbsp;
            <span
              className="inline-block h-3 w-3 rounded-sm align-middle"
              style={{ background: COLORS.array.bg, border: `2px solid ${COLORS.array.border}` }}
            />
            {" "}Array &nbsp;
            <span
              className="inline-block h-3 w-3 rounded-sm align-middle"
              style={{ background: COLORS.primitive.bg, border: `2px solid ${COLORS.primitive.border}` }}
            />
            {" "}Primitive
          </p>
        </div>
      </div>
      <Toast message={toast} onClose={() => setToast("")} />
    </div>
  );
}
