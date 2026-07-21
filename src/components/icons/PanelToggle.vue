<script setup lang="ts">
// 设计稿侧栏收起按钮：圆角外框(12.5% 内缩) + 靠左短竖线(高约 35%)，Notion 式面板开关。
withDefaults(defineProps<{ size?: number; strokeWidth?: number }>(), {
  size: 18,
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
      y="8"
      width="36"
      height="32"
      rx="10"
      stroke="currentColor"
      :stroke-width="strokeWidth * 2"
      stroke-linejoin="round"
    />
    <path
      d="M14 18V30"
      stroke="currentColor"
      :stroke-width="strokeWidth * 2"
      stroke-linecap="round"
    />
  </svg>
</template>
