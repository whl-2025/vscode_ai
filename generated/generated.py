# 导入必要的模块
import yaml
import os
import json

# 定义一个命名空间，用于限制内置函数的使用
ns = {'__builtins__': None }

# 打开并读取配置文件 app.yml
# 使用 yaml.FullLoader 安全地加载 YAML 数据
# 通过 BuiltinLoader 参数传递自定义命名空间
with open('app.yml', 'r') as file:  
    config_data = yaml.load(file, Loader=yaml.FullLoader, BuiltinLoader=ns)