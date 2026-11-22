"use client";

import type { EvaluatorTarget } from "@kortyx/telemetry-contracts";
import { useEffect, useRef, useState } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { evaluatorRequest } from "../api/client";
import { type EvaluatorRecording, EvaluatorRecordingsSchema } from "../schema";
import { EditorField } from "./editor-fields";

const recordingKey = (recording: EvaluatorRecording) =>
  JSON.stringify(recording.target);
const recordingLabel = (recording: EvaluatorRecording) =>
  `${recording.label} · ${recording.environment}`;

export function RecordingPicker({
  recordings,
  disabled,
  onChange,
}: {
  recordings: EvaluatorRecording[];
  disabled: boolean;
  onChange: (target: EvaluatorTarget | null) => void;
}) {
  const [selected, setSelected] = useState<EvaluatorRecording | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EvaluatorRecording[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const request = useRef<AbortController | null>(null);
  const cancelSearch = () => {
    clearTimeout(timer.current);
    request.current?.abort();
  };
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      request.current?.abort();
    },
    [],
  );
  const search = (value: string) => {
    cancelSearch();
    setQuery(value);
    setSelected(null);
    onChange(null);
    setResults([]);
    setError("");
    const runId = value.trim();
    setSearching(Boolean(runId));
    if (!runId) return;
    const abort = new AbortController();
    request.current = abort;
    timer.current = setTimeout(async () => {
      try {
        const response = EvaluatorRecordingsSchema.parse(
          await evaluatorRequest(
            `recordings?runId=${encodeURIComponent(runId)}`,
            undefined,
            abort.signal,
          ),
        );
        if (!abort.signal.aborted)
          setResults(
            response.recordings.filter(
              (record) =>
                record.target.type === "run" && record.target.runId === runId,
            ),
          );
      } catch (cause) {
        if (!abort.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to look up this run.",
          );
      } finally {
        if (!abort.signal.aborted) setSearching(false);
      }
    }, 250);
  };
  const matches = recordings.filter((record) =>
    recordingLabel(record).toLowerCase().includes(query.trim().toLowerCase()),
  );
  const items = [
    ...new Map(
      [...matches, ...results].map((record) => [recordingKey(record), record]),
    ).values(),
  ];
  return (
    <EditorField
      id="judge-recording"
      label="Recording"
      description="Search recent recordings or paste a full run ID. Each result includes its environment."
    >
      <Combobox<EvaluatorRecording>
        items={items}
        filter={null}
        value={selected}
        inputValue={query}
        itemToStringLabel={recordingLabel}
        itemToStringValue={recordingKey}
        isItemEqualToValue={(a, b) => recordingKey(a) === recordingKey(b)}
        disabled={disabled}
        onInputValueChange={(value, details) => {
          if (
            details.reason === "input-change" ||
            details.reason === "input-clear"
          )
            search(value);
        }}
        onValueChange={(record) => {
          if (!record) {
            setSelected(null);
            onChange(null);
            return;
          }
          cancelSearch();
          setSearching(false);
          setSelected(record);
          setQuery(recordingLabel(record));
          onChange(record.target);
        }}
      >
        <ComboboxInput
          id="judge-recording"
          aria-label="Recording"
          aria-describedby="judge-recording-description"
          placeholder="Search recordings or paste a run ID…"
          autoComplete="off"
          maxLength={512}
          className="w-full"
          disabled={disabled}
        />
        <ComboboxContent className="min-w-(--anchor-width) border ring-0">
          <ComboboxEmpty>
            {searching
              ? "Looking up run…"
              : "No matching recording. Try a full run ID."}
          </ComboboxEmpty>
          <ComboboxList aria-label="Recordings">
            {(record: EvaluatorRecording) => (
              <ComboboxItem key={recordingKey(record)} value={record}>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="break-all text-xs">{record.label}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {record.target.type === "run" ? "Run" : "Experiment case"} ·{" "}
                    {record.environment}
                  </span>
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </EditorField>
  );
}
