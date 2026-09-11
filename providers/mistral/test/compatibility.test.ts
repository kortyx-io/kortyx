import {
  describeCompatibility,
  describeOptions,
} from "../../test-compatibility";
import { createProvider } from "../src";

describeCompatibility("mistral", createProvider);
describeOptions("mistral", createProvider);
