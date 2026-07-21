<script setup lang="ts">
// 设计稿「更多」图标（Frame 7）：左上圆角方 + 左下圆 + 右上圆 + 右下圆角三角，
// 位置尺寸按 css复刻版本.txt ×2 换算（方 17.9² r4.5、圆 Ø16.8、三角 17.9×13.4）。
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
    <rect
      x="6"
      y="5.9"
      width="17.9"
      height="17.9"
      rx="4.5"
      stroke="currentColor"
      :stroke-width="strokeWidth * 2.2"
      stroke-linejoin="round"
    />
    <circle
      cx="14.4"
      cy="33.2"
      r="8.4"
      stroke="currentColor"
      :stroke-width="strokeWidth * 2.1"
    />
    <circle
      cx="34.5"
      cy="14.3"
      r="8.4"
      stroke="currentColor"
      :stroke-width="strokeWidth * 2.1"
    />
    <path
      d="M35.05 26L44 39.4H26.1L35.05 26Z"
      stroke="currentColor"
      :stroke-width="strokeWidth * 2.2"
      stroke-linejoin="round"
    />
  </svg>
</template>
