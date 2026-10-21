/**
 * La lista cerrada de capacidades: un único lugar, el extension host y el
 * manifiesto la comparten.
 *
 * `proc:spawn` (20-oct): lanzar un programa del anfitrión (REA, por ejemplo)
 * desde un módulo. Sin ella, la lista cerraba la puerta a lo que sólo sabe
 * hacer un motor externo, y el kit se quedaba sin ojos.
 */
export const CAPABILITIES = [
  "mind:read",
  "mind:write",
  "ipc:emit",
  "fs:project",
  "net:fetch",
  "ui:render",
  "proc:spawn",
] as const;

export type Capability = (typeof CAPABILITIES)[number];
