def bubble_sort(nums, reverse=False):  # Define the function with parameters for nums (list of numbers) and optional parameter 'reverse' to control sorting order. Default is False which means ascending sorted list. If True then it will be descending ordered list after each pass through loop
    if not bool(nums):   # Check whether inputted data exists or not, return false in such cases as they are invalid inputs for this function 
        print("Invalid Input!")
        return False    
    n = len(nums)          # Get the length of nums list. This will be used to control how many times loop should run (n is number of passes).  
    while n > 0:            # Run this until all elements are sorted in ascending order or descending if reverse=True passed as parameter 
        new_n = 0           # Initialize a counter for the swapping operations. This will be used to check whether we have finished sorting list after one pass through loop  
        for i in range(1, n):    # Run this until all elements are compared and possibly moved around  (i is index of current element)    
            if nums[i - 1] > nums[i]:      # If the previous number greater than next one then swap them. 'nums[i-1]' refers to previos value, while 'nums[i]' will be compared with it in future iterations  
                nums[i - 1], nums[i] = nums[i], nums[i - 1]    # Swap the numbers using Pythonic way of multiple assignment. This is a one-liner for swapping two values at once    
                new_n += 1                  # Increase counter 'new_n' by 1 after swap operation  
        n = new_n                      # Set current number of passes to the value stored in variable `new_n`. This will be used as a condition for next pass through loop    
    if reverse:                  # If parameter passed is True then sort list descending order after each iteration  
       nums.reverse()            # Reverse sorted numbers using Python's built-in method 'list.reverse'. This will make the final result as a reversed version of original one 
    return nums                  # Return or print out list once it is fully sorted in ascending order (or descended if reverse=True passed)  