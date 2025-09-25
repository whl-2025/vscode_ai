```python
import numpy as np

def bubble_sort(arr):
    """
    冒泡排序算法。

    Args:
        arr: 包含非排序的元素的数据集。

    Returns:
        一个包含排序后的数据集。
    """
    n = len(arr)
    sorted_arr = sorted(arr)
    for i in range(n):
        for j in range(n - i - 1, n - 1):
            if arr[i] > arr[j]:
                arr[i], arr[j] = arr[j], arr[i]
    return sorted_arr

# 示例用法
arr = [5, 2, 1, 4, 3, 6]
sorted_arr = bubble_sort(arr)
print(sorted_arr)
```