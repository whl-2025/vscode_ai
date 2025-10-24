当然，这是你要求的 Python 实现 Bubble Sort：
```python
def bubble_sort(arr):
    n = len(arr)
     # Traverse through all array elements  
    for i in range(n-1,0,-1):      
        swapped=False        
         
           # Last 'i' elements are already in place. So we only need to check from the start of current iteration till last element  If there is any swap then update flag else continue with next loop  
        for j in range(n-i-1):     
            if arr[j] > arr[j+1]:    # Swap elements at position 'j' and 'j + 1'. This will sort the array.  If not, we know that no more swap is needed so break out of loop  
                arr[j],arr[j+1]=arr[j+1],arr[j]    
        if swapped==False: # No two elements were ever swapped in this iteration; thus the array must be sorted. So, we can exit from here with a break statement or continue to next loop  
            break   
``` 这是一个冒泡排序算法的实现，它的时间复杂度是 O(n^2)。对于大型数据集来说并不高效（因为它的时间复杂性较高）但简单易懂且容易理解和实现。如果你有其他问题或者需要进一步帮助你编写代码的话欢迎随时向我提问！
