"use client";

import { ChevronRightIcon } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export const JSON_COLORS = {
  text: "#abb2bf",
  key: "#e06c75",
  string: "#98c379",
  number: "#d19a66",
  boolean: "#d19a66",
  null: "#d19a66",
  punctuation: "#abb2bf",
  preview: "#5c6370",
} as const;

const INDENT_PX = 16;

export type JsonTreeControl = {
  generation: number;
  targetExpanded: boolean;
};

export const JsonTreeContext = createContext<JsonTreeControl>({
  generation: 0,
  targetExpanded: true,
});

export function JsonKey({ name }: { name: string }) {
  return (
    <>
      <span style={{ color: JSON_COLORS.key }}>{JSON.stringify(name)}</span>
      <span style={{ color: JSON_COLORS.punctuation }}>: </span>
    </>
  );
}

export function JsonLine({
  depth,
  trailingComma = false,
  toggle,
  children,
}: {
  depth: number;
  trailingComma?: boolean;
  toggle?: { expanded: boolean; onToggle: () => void };
  children: ReactNode;
}) {
  return (
    <div className="flex items-start leading-relaxed">
      <div className="flex w-4 shrink-0 justify-center pt-0.5">
        {toggle ? (
          <button
            type="button"
            className="cursor-pointer rounded p-0 text-slate-500 hover:text-slate-300"
            onClick={toggle.onToggle}
            aria-expanded={toggle.expanded}
            aria-label={toggle.expanded ? "Collapse" : "Expand"}
          >
            <ChevronRightIcon
              className={`size-3 transition-transform ${
                toggle.expanded ? "rotate-90" : ""
              }`}
            />
          </button>
        ) : null}
      </div>
      <div
        className="min-w-0 flex-1"
        style={{ paddingLeft: depth * INDENT_PX }}
      >
        {children}
        {trailingComma ? (
          <span style={{ color: JSON_COLORS.punctuation }}>,</span>
        ) : null}
      </div>
    </div>
  );
}

export function JsonPrimitive({ value }: { value: unknown }) {
  if (value === null) {
    return <span style={{ color: JSON_COLORS.null }}>null</span>;
  }
  if (typeof value === "boolean") {
    return <span style={{ color: JSON_COLORS.boolean }}>{String(value)}</span>;
  }
  if (typeof value === "number") {
    return <span style={{ color: JSON_COLORS.number }}>{String(value)}</span>;
  }
  if (typeof value === "string") {
    return (
      <span className="break-all" style={{ color: JSON_COLORS.string }}>
        {JSON.stringify(value)}
      </span>
    );
  }
  return <span style={{ color: JSON_COLORS.text }}>{String(value)}</span>;
}

function JsonCollection({
  value,
  name,
  depth,
  defaultExpanded = true,
  trailingComma = false,
}: {
  value: Record<string, unknown> | unknown[];
  name?: string;
  depth: number;
  defaultExpanded?: boolean;
  trailingComma?: boolean;
}) {
  const { generation, targetExpanded } = useContext(JsonTreeContext);
  const collapsible = depth > 0;
  const [expanded, setExpanded] = useState(defaultExpanded);
  const syncedGeneration = useRef(generation);
  const isExpanded = collapsible ? expanded : true;

  useEffect(() => {
    if (!collapsible || syncedGeneration.current === generation) return;
    syncedGeneration.current = generation;
    setExpanded(targetExpanded);
  }, [collapsible, generation, targetExpanded]);

  const isArray = Array.isArray(value);
  const entries = isArray
    ? value.map((entry, index) => [String(index), entry] as const)
    : Object.entries(value);
  const open = isArray ? "[" : "{";
  const close = isArray ? "]" : "}";
  const preview = isArray
    ? `${entries.length} ${entries.length === 1 ? "item" : "items"}`
    : `${entries.length} ${entries.length === 1 ? "key" : "keys"}`;

  if (entries.length === 0) {
    return (
      <JsonLine depth={depth} trailingComma={trailingComma}>
        {name ? <JsonKey name={name} /> : null}
        <span style={{ color: JSON_COLORS.punctuation }}>
          {open}
          {close}
        </span>
      </JsonLine>
    );
  }

  return (
    <>
      <JsonLine
        depth={depth}
        trailingComma={!isExpanded ? trailingComma : false}
        {...(collapsible
          ? {
              toggle: {
                expanded: isExpanded,
                onToggle: () => setExpanded((prev) => !prev),
              },
            }
          : {})}
      >
        {name ? <JsonKey name={name} /> : null}
        <span style={{ color: JSON_COLORS.punctuation }}>{open}</span>
        {!isExpanded ? (
          <>
            <span className="italic" style={{ color: JSON_COLORS.preview }}>
              {preview}
            </span>
            <span style={{ color: JSON_COLORS.punctuation }}>{close}</span>
          </>
        ) : null}
      </JsonLine>
      {isExpanded
        ? entries.map(([key, entry], index) => (
            <JsonNode
              key={`${depth}:${key}`}
              {...(isArray ? {} : { name: key })}
              value={entry}
              depth={depth + 1}
              defaultExpanded={defaultExpanded}
              trailingComma={index < entries.length - 1}
            />
          ))
        : null}
      {isExpanded ? (
        <JsonLine depth={depth} trailingComma={trailingComma}>
          <span style={{ color: JSON_COLORS.punctuation }}>{close}</span>
        </JsonLine>
      ) : null}
    </>
  );
}

export function JsonNode({
  value,
  name,
  depth,
  defaultExpanded = true,
  trailingComma = false,
}: {
  value: unknown;
  name?: string;
  depth: number;
  defaultExpanded?: boolean;
  trailingComma?: boolean;
}) {
  if (value !== null && typeof value === "object") {
    return (
      <JsonCollection
        value={value as Record<string, unknown> | unknown[]}
        {...(name !== undefined ? { name } : {})}
        depth={depth}
        defaultExpanded={defaultExpanded}
        trailingComma={trailingComma}
      />
    );
  }

  return (
    <JsonLine depth={depth} trailingComma={trailingComma}>
      {name ? <JsonKey name={name} /> : null}
      <JsonPrimitive value={value} />
    </JsonLine>
  );
}
