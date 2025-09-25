<template>
  <div class="my-component">
    <h1>Hello Vue! {{ message }}</h1> 
   <button @click='changeMessage()' >Click me to change the text. </button> <!-- 当点击按钮时，会调用方法 -->  
  </div>   
</template>