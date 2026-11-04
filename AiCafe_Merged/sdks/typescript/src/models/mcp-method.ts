import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** MCP method name. */
export const McpMethod = {
  ValueInitializeDescriptionHandshakeVerb: '{"value":"initialize","description":"Handshake verb"}',
  ValueNotificationsInitializedDescriptionClientReadyNotification:
    '{"value":"notifications/initialized","description":"Client-ready notification"}',
  ValueToolsListDescriptionListAvailableTools: '{"value":"tools/list","description":"List available tools"}',
  ValueToolsCallDescriptionInvokeATool: '{"value":"tools/call","description":"Invoke a tool"}',
} as const;
export type McpMethod = (typeof McpMethod)[keyof typeof McpMethod] | (string & {});

export const mcpMethodSchema: EnumSchema<McpMethod> = s.enumOf<McpMethod>(McpMethod);
