<script setup lang="ts">
// 设计稿「新建对话」图标 = IconPark Add(添加)：圆角方框(12.5% 内缩) + 居中十字(33.3%~66.7%)
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
      y="6"
      width="36"
      height="36"
      rx="8"
      stroke="currentColor"
      :stroke-width="strokeWidth * 2"
      stroke-linejoin="round"
    />
    <path
      d="M24 16V32"
      stroke="currentColor"
      :stroke-width="strokeWidth * 2"
      stroke-linecap="round"
    />
    <path
      d="M16 24H32"
      stroke="currentColor"
      :stroke-width="strokeWidth * 2"
      stroke-linecap="round"
    />
  </svg>
</template>
