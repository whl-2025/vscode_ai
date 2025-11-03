def bubble_sort(arr):
    """
    时间复杂度: O(n^2)
    空间复杂度: O(1)
    """
    n = len(arr)
    for i in range(n):
        swapped = False
        for j in range(0, n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
                swapped = True
        if not swapped:
            break
    return arr
if __name__ == "__main__":
    test_array1 = [64, 34, 25, 12, 22, 11, 90]
    sorted_array1 = bubble_sort(test_array1.copy())
    test_array2 = [5, 2, 8, 1, 9]
    sorted_array2 = bubble_sort(test_array2.copy())
    test_array3 = [1, 2, 3, 4, 5]
    sorted_array3 = bubble_sort(test_array3.copy())