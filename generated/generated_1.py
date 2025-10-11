def bubble_sort(arr):  
    n = len(arr)  
    for i in range(n):  
        # last_i elements are already in place 
        for j in range(0, n-i-1):    
            if arr[j] > arr[j+1]:     
                arr[j],arr[j+1] = arr[j+1],arr[j]   # swap the items. Python's tuple swapping is used here for simplicity 
    return arr;         