export type StudioAuthMode = "basic" | "cloud" | "none";

export type StudioAuthConfig =
  | {
      mode: "basic";
      username: string | undefined;
      password: string | undefined;
    }
  | {
      mode: "cloud";
    }
  | {
      mode: "none";
    }
  | {
      mode: "invalid";
      value: string;
    };

export const resolveStudioAuthMode = (): StudioAuthMode | undefined => {
  const configured = process.env.KORTYX_STUDIO_AUTH_MODE;
  if (!configured) {
    return process.env.NODE_ENV === "production" ? "basic" : "none";
  }

  if (
    configured === "basic" ||
    configured === "cloud" ||
    configured === "none"
  ) {
    return configured;
  }

  return undefined;
};

export const getStudioAuthConfig = (): StudioAuthConfig => {
  const mode = resolveStudioAuthMode();
  if (!mode) {
    return {
      mode: "invalid",
      value: process.env.KORTYX_STUDIO_AUTH_MODE ?? "",
    };
  }
  if (mode !== "basic") return { mode };

  return {
    mode,
    username: process.env.KORTYX_STUDIO_BASIC_AUTH_USERNAME,
    password: process.env.KORTYX_STUDIO_BASIC_AUTH_PASSWORD,
  };
};
