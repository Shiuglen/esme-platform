/** La lista cerrada de capacidades: un único lugar, el extension host y el manifiesto la comparten. */
export const CAPABILITIES = [
  "mind:read",
  "mind:write",
  "ipc:emit",
  "fs:project",
  "net:fetch",
  "ui:render",
] as const;

export type Capability = (typeof CAPABILITIES)[number];
