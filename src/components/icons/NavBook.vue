<script setup lang="ts">
// 设计稿「知识库」图标 = IconPark Book-one(书籍1)，路径与 css复刻版本.txt 逐层包围盒完全吻合。
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
      d="M7 37C7 29.2967 7 11 7 11C7 7.68629 9.68629 5 13 5H35V31C35 31 18.2326 31 13 31C9.7 31 7 33.6842 7 37Z"
      stroke="currentColor"
      :stroke-width="strokeWidth * 2"
      stroke-linejoin="round"
    />
    <path
      d="M35 31C35 31 14.1537 31 13 31C9.68629 31 7 33.6863 7 37C7 40.3137 9.68629 43 13 43C15.2091 43 25.8758 43 41 43V7"
      stroke="currentColor"
      :stroke-width="strokeWidth * 2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M14 37H34"
      stroke="currentColor"
      :stroke-width="strokeWidth * 2"
      stroke-linecap="round"
    />
  </svg>
</template>
