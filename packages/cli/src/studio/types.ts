export type CommandResult = {
  stdout: string;
  stderr: string;
};

export type StudioRuntime = {
  run(
    command: string,
    args: string[],
    options: { cwd?: string; inherit?: boolean },
  ): Promise<CommandResult>;
  portAvailable(port: number): Promise<boolean>;
  now(): string;
  random(bytes: number): string;
  log(message?: string): void;
};

export type StudioStartOptions = {
  home: string;
  apiPort?: number;
  studioPort?: number;
  imageTag?: string;
  username?: string;
  projectName?: string;
};
