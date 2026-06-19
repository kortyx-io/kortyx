"use client";

import {
  closestCenter,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  type CSSProperties,
  createContext,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ColumnMotion,
  ColumnPin,
  DataTableColumn,
} from "@/components/data-table/types";

type LayoutSnapshot = {
  widths?: Record<string, number>;
  order?: string[];
  hidden?: string[];
  pinned?: Partial<Record<string, ColumnPin>>;
};

export type DataTableContextValue<T = unknown, S extends string = string> = {
  columns: DataTableColumn<T, S>[];
  columnsByKey: Record<string, DataTableColumn<T, S>>;
  defaultOrder: string[];
  widths: Record<string, number>;
  order: string[];
  hidden: string[];
  pinned: Partial<Record<string, ColumnPin>>;
  visibleColumnOrder: string[];
  tableWidth: number;
  toggleColumnVisibility: (key: string) => void;
  showAllColumns: () => void;
  resetLayout: () => void;
  resetColumnWidth: (key: string) => void;
  pinColumn: (key: string, side: ColumnPin) => void;
  unpinColumn: (key: string) => void;
  startColumnResize: (
    key: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  isColumnDraggable: (key: string) => boolean;
  getPinnedColumnStyle: (key: string) => CSSProperties | undefined;
  getColumnCellMotion: (key: string) => ColumnMotion | undefined;
  sensors: ReturnType<typeof useSensors>;
  collisionDetection: (
    args: Parameters<typeof closestCenter>[0],
  ) => ReturnType<typeof closestCenter>;
  draggedColumn: string | null;
  isPinnedColumnDragging: boolean;
  onDragStart: (event: DragStartEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragMove: (event: DragMoveEvent) => void;
  onDragCancel: () => void;
  onDragEnd: (event: DragEndEvent) => void;
  scrollerRef: RefObject<HTMLDivElement | null>;
};

const DataTableContext = createContext<DataTableContextValue | null>(null);

export function useDataTable<
  T = unknown,
  S extends string = string,
>(): DataTableContextValue<T, S> {
  const context = useContext(DataTableContext);
  if (!context) {
    throw new Error("useDataTable must be used within a <DataTableProvider>");
  }
  return context as unknown as DataTableContextValue<T, S>;
}

type DataTableProviderProps<T, S extends string> = {
  columns: DataTableColumn<T, S>[];
  /** localStorage key for persisting widths, order, hidden, and pinned state. */
  persistKey?: string;
  children: ReactNode;
};

function arrayMove<V>(array: V[], from: number, to: number): V[] {
  const next = array.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function DataTableProvider<T, S extends string>({
  columns,
  persistKey,
  children,
}: DataTableProviderProps<T, S>) {
  const defaultOrder = useMemo(
    () => columns.map((column) => column.key),
    [columns],
  );
  const columnsByKey = useMemo(
    () =>
      Object.fromEntries(
        columns.map((column) => [column.key, column]),
      ) as Record<string, DataTableColumn<T, S>>,
    [columns],
  );
  const defaultWidths = useMemo(
    () =>
      Object.fromEntries(
        columns.map((column) => [column.key, column.defaultWidth]),
      ) as Record<string, number>,
    [columns],
  );
  const minWidths = useMemo(
    () =>
      Object.fromEntries(
        columns.map((column) => [column.key, column.minWidth]),
      ) as Record<string, number>,
    [columns],
  );

  const [widths, setWidths] = useState<Record<string, number>>(defaultWidths);
  const [order, setOrder] = useState<string[]>(defaultOrder);
  const [hidden, setHidden] = useState<string[]>([]);
  const [pinned, setPinned] = useState<Partial<Record<string, ColumnPin>>>({});
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: load layout once per persistKey, not on column changes.
  useEffect(() => {
    if (!persistKey) {
      setPreferencesLoaded(true);
      return;
    }
    try {
      const saved = JSON.parse(
        localStorage.getItem(persistKey) ?? "{}",
      ) as LayoutSnapshot & Record<string, number>;
      const savedWidths = saved.widths ?? saved;
      setWidths((current) => ({ ...current, ...savedWidths }));
      if (
        saved.order?.length === defaultOrder.length &&
        saved.order.every((column) => defaultOrder.includes(column))
      ) {
        setOrder(saved.order);
      }
      if (saved.hidden?.every((column) => defaultOrder.includes(column))) {
        setHidden(saved.hidden);
      }
      if (saved.pinned) {
        setPinned(
          Object.fromEntries(
            Object.entries(saved.pinned).filter(
              ([column, side]) =>
                defaultOrder.includes(column) &&
                (side === "left" || side === "right"),
            ),
          ),
        );
      }
    } catch {
      // Ignore invalid local preferences.
    } finally {
      setPreferencesLoaded(true);
    }
  }, [persistKey]);

  useEffect(() => {
    if (!persistKey || !preferencesLoaded) return;
    localStorage.setItem(
      persistKey,
      JSON.stringify({ widths, order, hidden, pinned }),
    );
  }, [persistKey, preferencesLoaded, widths, order, hidden, pinned]);

  const visibleColumns = useMemo(
    () => order.filter((column) => !hidden.includes(column)),
    [order, hidden],
  );
  const visibleColumnOrder = useMemo(
    () => [
      ...visibleColumns.filter((column) => pinned[column] === "left"),
      ...visibleColumns.filter((column) => !pinned[column]),
      ...visibleColumns.filter((column) => pinned[column] === "right"),
    ],
    [visibleColumns, pinned],
  );
  const tableWidth = useMemo(
    () =>
      visibleColumnOrder.reduce((total, column) => total + widths[column], 0),
    [visibleColumnOrder, widths],
  );
  const isPinnedColumnDragging =
    draggedColumn !== null && Boolean(pinned[draggedColumn]);

  function toggleColumnVisibility(key: string) {
    setHidden((current) => {
      if (current.includes(key)) {
        return current.filter((item) => item !== key);
      }
      if (current.length === order.length - 1) return current;
      return [...current, key];
    });
  }

  function showAllColumns() {
    setHidden([]);
  }

  function resetLayout() {
    setOrder(defaultOrder);
    setWidths(defaultWidths);
    setHidden([]);
    setPinned({});
  }

  function resetColumnWidth(key: string) {
    setWidths((current) => ({ ...current, [key]: defaultWidths[key] }));
  }

  function pinColumn(key: string, side: ColumnPin) {
    setPinned((current) => ({ ...current, [key]: side }));
  }

  function unpinColumn(key: string) {
    setPinned((current) => {
      const { [key]: _pin, ...remaining } = current;
      return remaining;
    });
  }

  function startColumnResize(
    key: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = widths[key];

    function resize(moveEvent: PointerEvent) {
      setWidths((current) => ({
        ...current,
        [key]: Math.max(
          minWidths[key],
          Math.round(startWidth + moveEvent.clientX - startX),
        ),
      }));
    }

    function stopResize() {
      document.body.classList.remove("cursor-col-resize", "select-none");
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stopResize);
    }

    document.body.classList.add("cursor-col-resize", "select-none");
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stopResize, { once: true });
  }

  function isColumnDraggable(key: string) {
    const pin = pinned[key];
    return (
      !pin ||
      visibleColumnOrder.filter((item) => pinned[item] === pin).length > 1
    );
  }

  function getPinnedColumnStyle(key: string): CSSProperties | undefined {
    const side = pinned[key];
    if (!side) return undefined;
    const pinnedOnSide = visibleColumnOrder.filter(
      (item) => pinned[item] === side,
    );
    const index = pinnedOnSide.indexOf(key);
    const offsetColumns =
      side === "left"
        ? pinnedOnSide.slice(0, index)
        : pinnedOnSide.slice(index + 1);
    const offset = offsetColumns.reduce(
      (total, item) => total + widths[item],
      0,
    );
    return side === "left" ? { left: offset } : { right: offset };
  }

  function getColumnCellMotion(key: string): ColumnMotion | undefined {
    if (!draggedColumn || !dragOverColumn) return undefined;
    const activeIndex = visibleColumnOrder.indexOf(draggedColumn);
    const overIndex = visibleColumnOrder.indexOf(dragOverColumn);
    const columnIndex = visibleColumnOrder.indexOf(key);
    if (activeIndex === -1 || overIndex === -1 || columnIndex === -1) {
      return undefined;
    }
    if (key === draggedColumn) {
      return { style: { transform: `translate3d(${dragOffset}px, 0, 0)` } };
    }
    const shiftsLeft =
      activeIndex < overIndex &&
      columnIndex > activeIndex &&
      columnIndex <= overIndex;
    const shiftsRight =
      activeIndex > overIndex &&
      columnIndex >= overIndex &&
      columnIndex < activeIndex;
    if (!shiftsLeft && !shiftsRight) return undefined;
    const shift = widths[draggedColumn] * (shiftsLeft ? -1 : 1);
    return {
      style: {
        transform: `translate3d(${shift}px, 0, 0)`,
        transition: "transform 150ms ease",
      },
    };
  }

  const collisionDetection = (args: Parameters<typeof closestCenter>[0]) => {
    const activePin = pinned[args.active.id as string];
    return closestCenter(args).filter(
      (collision) => pinned[collision.id as string] === activePin,
    );
  };

  function onDragStart(event: DragStartEvent) {
    const column = event.active.id as string;
    setDraggedColumn(column);
    setDragOverColumn(column);
  }

  function onDragOver(event: DragOverEvent) {
    const overColumn = event.over?.id as string | undefined;
    if (
      overColumn &&
      draggedColumn &&
      pinned[draggedColumn] !== pinned[overColumn]
    ) {
      return;
    }
    setDragOverColumn(overColumn ?? null);
  }

  function onDragMove(event: DragMoveEvent) {
    setDragOffset(event.delta.x);
  }

  function onDragCancel() {
    setDraggedColumn(null);
    setDragOverColumn(null);
    setDragOffset(0);
  }

  function onDragEnd(event: DragEndEvent) {
    setDraggedColumn(null);
    setDragOverColumn(null);
    setDragOffset(0);
    if (!event.over || event.active.id === event.over.id) return;
    const activeColumn = event.active.id as string;
    const overColumn = event.over.id as string;
    if (pinned[activeColumn] !== pinned[overColumn]) return;
    setOrder((current) =>
      arrayMove(
        current,
        current.indexOf(activeColumn),
        current.indexOf(overColumn),
      ),
    );
  }

  const value: DataTableContextValue<T, S> = {
    columns,
    columnsByKey,
    defaultOrder,
    widths,
    order,
    hidden,
    pinned,
    visibleColumnOrder,
    tableWidth,
    toggleColumnVisibility,
    showAllColumns,
    resetLayout,
    resetColumnWidth,
    pinColumn,
    unpinColumn,
    startColumnResize,
    isColumnDraggable,
    getPinnedColumnStyle,
    getColumnCellMotion,
    sensors,
    collisionDetection,
    draggedColumn,
    isPinnedColumnDragging,
    onDragStart,
    onDragOver,
    onDragMove,
    onDragCancel,
    onDragEnd,
    scrollerRef,
  };

  return (
    <DataTableContext.Provider
      value={value as unknown as DataTableContextValue}
    >
      {children}
    </DataTableContext.Provider>
  );
}
