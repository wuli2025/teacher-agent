<script setup lang="ts">
// 设计稿「AI 教案」图标（Frame 5）：圆角文档(34×38 r8) + 右上折角(11×10 r4) + 三行文本(短/长/长)。
// 几何值按 css复刻版本.txt ×2 换算到 48 视口。
withDefaults(defineProps<{ size?: number; strokeWidth?: number }>(), {
  size: 24,
  strokeWidth: 1.6,
});
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M31 6H16A8 8 0 0 0 8 14V36A8 8 0 0 0 16 44H34A8 8 0 0 0 42 36V16L31 6Z"
      stroke="currentColor"
      :stroke-width="strokeWidth * 2"
      stroke-linejoin="round"
    />
    <path
      d="M31 6V12A4 4 0 0 0 35 16H42"
      stroke="currentColor"
      :stroke-width="strokeWidth * 2"
      stroke-linejoin="round"
    />
    <path
      d="M17 22H25"
      stroke="currentColor"
      :stroke-width="strokeWidth * 2"
      stroke-linecap="round"
    />
    <path
      d="M17 28H33"
      stroke="currentColor"
      :stroke-width="strokeWidth * 2"
      stroke-linecap="round"
    />
    <path
      d="M17 34H33"
      stroke="currentColor"
      :stroke-width="strokeWidth * 2"
      stroke-linecap="round"
    />
  </svg>
</template>
