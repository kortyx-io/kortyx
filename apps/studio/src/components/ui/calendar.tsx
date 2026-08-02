"use client";

import { DayPicker, type DayPickerProps } from "react-day-picker";
import { cn } from "@/lib/utils";

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: DayPickerProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      timeZone="UTC"
      className={cn("p-1", className)}
      classNames={{
        root: "w-fit",
        months: "flex flex-col",
        month: "space-y-3",
        month_caption:
          "relative flex h-8 items-center justify-center font-medium text-sm",
        caption_label: "select-none",
        nav: "absolute inset-x-1 top-1 flex items-center justify-between",
        button_previous:
          "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50",
        button_next:
          "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "w-9 rounded-md text-center text-[0.72rem] font-normal text-muted-foreground",
        weeks: "block",
        week: "mt-1 flex w-full",
        day: "relative size-9 p-0 text-center text-sm [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-range-start)]:rounded-l-md",
        day_button:
          "inline-flex size-9 items-center justify-center rounded-md font-normal hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 aria-selected:opacity-100",
        range_start: "day-range-start bg-primary text-primary-foreground",
        range_end: "day-range-end bg-primary text-primary-foreground",
        range_middle:
          "rounded-none bg-accent text-accent-foreground [&>button]:rounded-none",
        selected: "",
        today: "font-semibold text-primary",
        outside: "text-muted-foreground opacity-40",
        disabled: "text-muted-foreground opacity-35",
        hidden: "invisible",
        ...classNames,
      }}
      {...props}
    />
  );
}
