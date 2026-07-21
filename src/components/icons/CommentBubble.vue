<script setup lang="ts">
// 设计稿历史对话行图标 = IconPark Comment(评论)：方角气泡 + 三竖点。
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
      d="M44 6H4V36H13V41L23 36H44V6Z"
      stroke="currentColor"
      :stroke-width="strokeWidth * 2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M14 19.5V22.5"
      stroke="currentColor"
      :stroke-width="strokeWidth * 2"
      stroke-linecap="round"
    />
    <path
      d="M24 19.5V22.5"
      stroke="currentColor"
      :stroke-width="strokeWidth * 2"
      stroke-linecap="round"
    />
    <path
      d="M34 19.5V22.5"
      stroke="currentColor"
      :stroke-width="strokeWidth * 2"
      stroke-linecap="round"
    />
  </svg>
</template>
