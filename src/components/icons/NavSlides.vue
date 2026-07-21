<script setup lang="ts">
// 设计稿「AI 课件PPT」图标（Frame 4/Group 1）：三个节点圆 + 一条穿过它们的大圆环。
// 圆心/弧段包围盒按 css复刻版本.txt 逐层几何值反推：环心(23.2,24.4) r≈16.5，节点 r3.62(×2=7.24)。
// 环在节点圆内部的弧段用 mask 挖掉，只留节点之间的三段连接弧，与设计稿一致。
withDefaults(defineProps<{ size?: number; strokeWidth?: number }>(), {
  size: 24,
  strokeWidth: 1.6,
});
const uid = `ns-${Math.random().toString(36).slice(2, 8)}`;
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <mask :id="uid">
      <rect width="48" height="48" fill="#fff" />
      <circle cx="16.6" cy="9.9" r="8.9" fill="#000" />
      <circle cx="14" cy="37.5" r="8.9" fill="#000" />
      <circle cx="39" cy="25.7" r="8.9" fill="#000" />
    </mask>
    <circle
      cx="23.2"
      cy="24.4"
      r="16.5"
      stroke="currentColor"
      :stroke-width="strokeWidth * 2"
      :mask="`url(#${uid})`"
    />
    <circle
      cx="16.6"
      cy="9.9"
      r="7.24"
      stroke="currentColor"
      :stroke-width="strokeWidth * 2"
    />
    <circle
      cx="14"
      cy="37.5"
      r="7.24"
      stroke="currentColor"
      :stroke-width="strokeWidth * 2"
    />
    <circle
      cx="39"
      cy="25.7"
      r="7.24"
      stroke="currentColor"
      :stroke-width="strokeWidth * 2"
    />
  </svg>
</template>
