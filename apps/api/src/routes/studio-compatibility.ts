import {
  STUDIO_API_PROTOCOL_VERSION,
  type StudioDetailEvent,
  type StudioInterrupt,
} from "@kortyx/telemetry-contracts";

export const currentStudioReadContract = (
  header: string | undefined,
): boolean => header === STUDIO_API_PROTOCOL_VERSION;

export const compatibleStudioInterrupt = (
  interrupt: StudioInterrupt,
  current: boolean,
): StudioInterrupt => {
  if (current) return interrupt;
  const {
    contract: _contract,
    request: _request,
    requestCaptured: _requestCaptured,
    responseValue: _responseValue,
    ...legacy
  } = interrupt;
  return {
    ...legacy,
    type: interrupt.type === "structured" ? "unknown" : interrupt.type,
  } as StudioInterrupt;
};

export const compatibleStudioEvents = (
  events: StudioDetailEvent[],
  current: boolean,
): StudioDetailEvent[] =>
  current
    ? events
    : events.filter(
        (event) =>
          ![
            "error.reported",
            "workflow.suspended",
            "workflow.resumed",
          ].includes(event.type),
      );
