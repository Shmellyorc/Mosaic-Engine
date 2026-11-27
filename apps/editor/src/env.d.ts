import type { DesktopApi } from "../../desktop/src/contracts";
declare global {
  interface Window {
    mosaic?: DesktopApi;
  }
}
export {};
