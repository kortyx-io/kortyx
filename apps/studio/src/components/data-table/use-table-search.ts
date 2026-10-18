"use client";
import { useEffect, useRef } from "react";
import { studioFeature } from "@/usage/client";

/** Presentation and privacy-safe usage reporting; query state has a single owner. */
export function useTableSearch(search: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}) {
  const previous = useRef(search.value);
  useEffect(() => {
    if (search.value === previous.current) return;
    const timer = setTimeout(() => {
      previous.current = search.value;
      studioFeature("studio.filter", { action: "apply", filter: "search" });
    }, 350);
    return () => clearTimeout(timer);
  }, [search.value]);
  return {
    ...search,
    label: search.label ?? "Search table",
    placeholder: search.placeholder ?? "Search all columns…",
  };
}
