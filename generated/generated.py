import yaml  
import os
import json

ns = {'__builtins__': None }
with open('app.yml', 'r') as file:  
    config_data= yaml.load(file, Loader=yaml.FullLoader, BuiltinLoader=ns)  