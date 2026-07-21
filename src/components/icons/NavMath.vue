<script setup lang="ts">
// 设计稿「生成数学课件」图标（Frame 9/Group 2）：上下两条圆角横杠（粗等号），
// 上杠 (8.9,6) 31×16、下杠镜像 (8,26) 31×16，按 css复刻版本.txt ×2 换算。
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
      x="9"
      y="6"
      width="31"
      height="16"
      rx="6"
      stroke="currentColor"
      :stroke-width="strokeWidth * 2"
      stroke-linejoin="round"
    />
    <rect
      x="8"
      y="26"
      width="31"
      height="16"
      rx="6"
      stroke="currentColor"
      :stroke-width="strokeWidth * 2"
      stroke-linejoin="round"
    />
  </svg>
</template>
