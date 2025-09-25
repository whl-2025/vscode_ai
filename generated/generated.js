function bubbleSort(arr) {    //定义函数，接受参数 arr (要进行比较的元素集合);    
var len = arr.length;
 for (var i = 0 ; i < len-1;i++) {    /*外层循环遍历所有项，但最后一个已经排好序了*/  
for( var j = arr.length - 2;j >= i+1;)
{    /*如果当前项大于其后面的元素（即arr[j] > arr [ j+ i +2 ] 是true的话*/
if (arr[j]>arr[j+ 1])
           {    /*如果条件为真（即当前项大于下一个元素时）*/     
var temp = arr [ j ];
              arr[j]=arr[j+ 1];       /*然后是下一个元素*/     
arr[j + 1 ] = temp;
           }   
         else  { j--;}                //如果条件不为真（即当前项不大于下一个元素时 -> arr[j] <=arr [j+1])则不需要做任何操作。继续到数组的剩余部分进行循环，因为我们知道该数字已经在正确的位置上  
}    /*内层for loop结束*/
}    /*内层for loop结束*/
return arr;     /*返回最终数组*/
}    /*函数结束 */ 