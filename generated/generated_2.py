def bubble_sort(arr):
    n = len(arr)
    # Traverse through all array elements
    for i in range(n-1,0,-1):
        swapped = False
        # Last i elements are already in place so we only need to check from the start of current iteration till last element. If there is any swap then update flag else continue with next loop 
        for j in range(i):
            if arr[j] > arr[j+1]:
                swapped = True
                # Swap elements at position 'j' and 'j + 1'. This will sort the array. If not, we know that no more swap is needed so break out of loop 
                arr[j],arr[j+1]=arr[j+1],arr[j]  
        if swapped == False: # No two elements were ever swapped in this iteration; thus the array must be sorted. So, we can exit from here with a break statement or continue to next loop 