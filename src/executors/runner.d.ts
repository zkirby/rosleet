import { Language, OutputType } from "../types";

type Output = {
  text: string;
  type: OutputType | null;
};

/** Responsible for running code from a specific language */
export abstract class Runner {
  public static language: Language;
  public initialized: boolean;

  /** initialize the runner if needed */
  public async init(dataset: string): void;

  /** skeleton starter code */
  public getSkeleton(): string;

  /** Runs the code */
  public async *run(code: string): AsyncGenerator<Output, void, unknown>;
}
