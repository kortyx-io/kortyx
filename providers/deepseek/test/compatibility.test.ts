import {
  describeCompatibility,
  describeOptions,
} from "../../test-compatibility";
import { createProvider } from "../src";

describeCompatibility("deepseek", createProvider);
describeOptions("deepseek", createProvider);
