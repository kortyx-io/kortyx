import {
  describeCompatibility,
  describeOptions,
} from "../../test-compatibility";
import { createProvider } from "../src";

describeCompatibility("google", createProvider);
describeOptions("google", createProvider);
