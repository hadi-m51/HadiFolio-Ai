from flask import Flask
app = Flask(__name__)

@app.route('/<path:path>')
def serve(path): return 'static'

@app.route('/api/query', methods=['POST'])
def query(): return 'query'

print(app.url_map)
