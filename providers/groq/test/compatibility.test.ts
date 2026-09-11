import {
  describeCompatibility,
  describeOptions,
} from "../../test-compatibility";
import { createProvider } from "../src";

describeCompatibility("groq", createProvider);
describeOptions("groq", createProvider);
