<script setup lang="ts">
// 设计稿「更多」行尾箭头 = IconPark Down(下)：25%~75% 宽、37.5%~62.5% 高的折线。
withDefaults(defineProps<{ size?: number; strokeWidth?: number }>(), {
  size: 22,
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
      d="M36 18L24 30L12 18"
      stroke="currentColor"
      :stroke-width="strokeWidth * 2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
