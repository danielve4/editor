from flask import Flask, render_template
from flask_socketio import SocketIO, emit
import time

app = Flask(__name__, static_url_path='/static')
app.config['SECRET_KEY'] = 'wizard'
socketio = SocketIO(app)


@app.route('/')
def index():
    return render_template('index.html')



@socketio.on('connect')
def test_connect():
    print('Client connected')
    emit('my response', {'data': 'Connected'})


@socketio.on('predict')
def predict():
    print("querying predictions")
    stri = ""
    for i in range(0, 55):
        stri += str(i) + " "
        if(i % 10 or i == 54):
            emit('str', stri)
            time.sleep(1)



@socketio.on('writing_prediction')
def writing_prediction(payload):
    print("writing_prediction")
    emit('writing_suggestions', {'data': '["Daniel","Vega"]'})



@socketio.on('disconnect')
def test_disconnect():
    print('Client disconnected')



if __name__ == '__main__':
    socketio.run(app)
