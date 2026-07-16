/// <reference types="vite/client" />

// 由 vite.config.ts 的 define 在构建期替换成 package.json 的版本字符串。
declare const __APP_VERSION__: string;

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare module "vue-virtual-scroller" {
  import { Component } from "vue";
  export const RecycleScroller: Component;
  export const DynamicScroller: Component;
  export const DynamicScrollerItem: Component;
}
