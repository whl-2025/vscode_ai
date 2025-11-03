<template>
    <div>
        <div>ceshi</div>
        <div>{{123}}</div>
        <input></input>
        <button @click="queryData">查询</button>
        <div v-for="item in dataList" :key="item.id">
            {{ item.name }}
        </div>
    </div>
</template>

<script>
export default {
    data() {
        return {
            dataList: []
        }
    },
    methods: {
        queryData() {
            // 模拟查询数据
            this.dataList = [
                { id: 1, name: '数据1' },
                { id: 2, name: '数据2' },
                { id: 3, name: '数据3' }
            ]
        }
    }
}
</script>

<style scoped>
    /* 样式 */
</style>