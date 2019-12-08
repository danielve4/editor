from flask import Flask, request, Response, jsonify, render_template, send_from_directory
from flask_socketio import SocketIO, emit
import torch
import torch.nn.functional as F
from transformers import GPT2Tokenizer, GPT2LMHeadModel
from tqdm import trange
import time
import json
import eventlet

app = Flask(__name__, static_url_path='/static')
app.config['SECRET_KEY'] = 'wizard'
socketio = SocketIO(app, logger=True, engineio_logger=True)

print('Initializing model')
model = GPT2LMHeadModel.from_pretrained('gpt2-xl')

print('Initializing tokenizer')
tokenizer = GPT2Tokenizer.from_pretrained('gpt2-xl')

eventlet.monkey_patch()
def top_k_top_p_filtering(logits, top_k=0, top_p=0.0, filter_value=-float('Inf')):
    """ Filter a distribution of logits using top-k and/or nucleus (top-p) filtering
        Args:
            logits: logits distribution shape (batch size x vocabulary size)
            top_k > 0: keep only top k tokens with highest probability (top-k filtering).
            top_p > 0.0: keep the top tokens with cumulative probability >= top_p (nucleus filtering).
                Nucleus filtering is described in Holtzman et al. (http://arxiv.org/abs/1904.09751)
        From: https://gist.github.com/thomwolf/1a5a29f6962089e871b94cbd09daf317
    """
    top_k = min(top_k, logits.size(-1))  # Safety check
    if top_k > 0:
        # Remove all tokens with a probability less than the last token of the top-k
        indices_to_remove = logits < torch.topk(logits, top_k)[
            0][..., -1, None]
        logits[indices_to_remove] = filter_value

    if top_p > 0.0:
        sorted_logits, sorted_indices = torch.sort(logits, descending=True)
        cumulative_probs = torch.cumsum(
            F.softmax(sorted_logits, dim=-1), dim=-1)

        # Remove tokens with cumulative probability above the threshold
        sorted_indices_to_remove = cumulative_probs > top_p
        # Shift the indices to the right to keep also the first token above the threshold
        sorted_indices_to_remove[...,
                                 1:] = sorted_indices_to_remove[..., :-1].clone()
        sorted_indices_to_remove[..., 0] = 0

        # scatter sorted tensors to original indexing
        indices_to_remove = sorted_indices_to_remove.scatter(
            dim=1, index=sorted_indices, src=sorted_indices_to_remove)
        logits[indices_to_remove] = filter_value
    return logits


def tokenize_input(string, num_samples=1, device='cpu'):
    tokens = tokenizer.encode(string, add_special_tokens=False)
    tokens = torch.tensor(tokens, dtype=torch.long, device=device)
    tokens = tokens.unsqueeze(0).repeat(num_samples, 1)
    return tokens


def generate_tokens_with(context_str, prev_generated=None, length=1, num_samples=1, temperature=1, top_k=0, top_p=0.0, repetition_penalty=1.0, device='cpu'):
    # Tokenizing context
    if prev_generated is not None:
        generated = prev_generated
        print("Using prev_generated")
    elif context_str is not None:
        generated = tokenize_input(context_str, device=device)
        print("Using context_str")

    next_tokens = torch.tensor([], dtype=torch.long, device=device)

    with torch.no_grad():
        for _ in trange(length):
            inputs = {'input_ids': generated}
            # Passing tokenized context to model. **inputs simply passes the 'generated' value
            outputs = model(**inputs)
            next_token_logits = outputs[0][:, -1, :] / \
                (temperature if temperature > 0 else 1.)

            for i in range(num_samples):
                for _ in set(generated[i].tolist()):
                    next_token_logits[i, _] /= repetition_penalty

            filtered_logits = top_k_top_p_filtering(
                next_token_logits, top_k=top_k, top_p=top_p)
            if temperature == 0:  # greedy sampling:
                next_token = torch.argmax(
                    filtered_logits, dim=-1).unsqueeze(-1)
            else:
                next_token = torch.multinomial(
                    F.softmax(filtered_logits, dim=-1), num_samples=1)
                generated = torch.cat((generated, next_token), dim=1)
                next_tokens = torch.cat((next_tokens, next_token), dim=1)

    text = tokenizer.decode(next_tokens[0].tolist())
    return text, generated


@app.route('/')
def index():
    return render_template('index.html')


@socketio.on('connect')
def test_connect():
    print('Client connected')
    emit('my response', {'data': 'Connected'})


@socketio.on('writing_prediction')
def writing_prediction(payload):
    print("writing_prediction")
    emit('writing_suggestions', {'data': '["Daniel","Vega"]'})


def handle_freeform(payload):
    freeform_parameters = json.loads(payload)
    raw_text = str(freeform_parameters['text'])
    length_per_sentence = 5
    samples = 1
    top_k = 40
    top_p = 0.9
    if 'length_per_setence' in freeform_parameters:
        length_per_sentence = int(freeform_parameters['length_per_setence'])

    if 'samples' in freeform_parameters:
        samples = int(freeform_parameters['samples'])

    if 'top_k' in freeform_parameters:
        top_k = int(freeform_parameters['top_k'])

    if 'top_p' in freeform_parameters:
        top_p = float(freeform_parameters['top_p'])

    generated = None
    token_length_increment = min(length_per_sentence, 5)
    while length_per_sentence > 0:
        text, generated = generate_tokens_with(context_str=raw_text,
                                               prev_generated=generated,
                                               length=token_length_increment,
                                               top_k=top_k,
                                               top_p=top_p)
        length_per_sentence -= token_length_increment
        token_length_increment = length_per_sentence if length_per_sentence < token_length_increment else token_length_increment
        emit('freeform_completion', {'data': text})

@socketio.on('freeform_request')
def freeform_request(payload):
    print("freeform_request")
    handle_freeform(payload)

    # stri = ""
    # for i in range(0, 55):
    #     stri += str(i) + " "
    #     if(i % 10 == 0 or i == 54):
    #         emit('freeform_completion', {'data': stri + "\n"})
    #         time.sleep(1)
    #         stri = ""


@socketio.on('disconnect')
def test_disconnect():
    print('Client disconnected')


if __name__ == '__main__':
    socketio.run(app, port=5000, host='0.0.0.0')
