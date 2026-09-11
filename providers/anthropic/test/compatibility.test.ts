import {
  describeCompatibility,
  describeOptions,
} from "../../test-compatibility";
import { createProvider } from "../src";

describeCompatibility("anthropic", createProvider);
describeOptions("anthropic", createProvider);
